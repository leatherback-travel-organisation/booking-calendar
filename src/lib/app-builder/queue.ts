import "server-only";

import { APP_BUILDER_MAX_TURNS, type AppBuilderRequest } from "./model";
import { APP_BUILDER_PROMPT, APP_BUILDER_TOOLS, responseText, runAppBuilderTool, type AgentResponse } from "./agent";
import {
  claimAppBuilderResponse, claimAppBuilderReversal, claimNextAppBuilderRequest,
  deleteAppBuilderPdf, findAppBuilderRequestById, findAppBuilderRequestByResponse,
  createAppBuilderBriefReadUrl, listAppBuilderPublishingRequestIds, listRecoverableAppBuilderResponses,
  loadAppBuilderBrief, loadAppBuilderStagedChanges, recoverStalledAppBuilderRequests, updateAppBuilderRequest,
} from "./server";
import {
  approveAndMergePullRequest,
  closeGitHubPullRequest,
  getPullRequestChecks,
  prepareGitHubPullRequest,
  prepareGitHubRevertPullRequest,
  updateGitHubPullRequestFiles,
} from "@/lib/systems/sso-providers";

type FinalResult = { blocked: boolean; title: string; summary: string };

export async function kickAppBuilderQueue(targetAssetId: string) {
  const request = await claimNextAppBuilderRequest(targetAssetId);
  if (!request) return;
  try {
    const brief = await loadAppBuilderBrief(request.id);
    let fileInput: Record<string, string>;
    if (brief.blobUrl) {
      // OpenAI rejects filename alongside file_url (mutually exclusive);
      // filename is only valid with inline file_data.
      fileInput = { type: "input_file", file_url: await createAppBuilderBriefReadUrl(brief.blobUrl) };
    } else if (brief.bytes) {
      fileInput = { type: "input_file", filename: request.filename, file_data: `data:application/pdf;base64,${Buffer.from(brief.bytes).toString("base64")}` };
    } else {
      throw new Error("The uploaded PDF is unavailable.");
    }
    const response = await createResponse({
      request,
      input: [{ role: "user", content: [
        { type: "input_text", text: `Bound app: ${request.targetName}\nBound repository: ${request.repositoryPath}\nProduction URL: ${request.productionUrl}\n\nRequester notes:\n${request.notes || "Implement the requested changes in the attached PDF."}` },
        fileInput,
      ] }],
    });
    await updateAppBuilderRequest(request.id, { status: "waiting_openai", detail: "Understanding the requested changes", responseId: response.id, turn: 1 });
  } catch (error) { await fail(request.id, targetAssetId, error); }
}

/**
 * Drive every kind of outstanding App Builder work for the given targets:
 * recover stalled runs, resume completed OpenAI responses the webhook missed,
 * advance publishing and reversals, and start queued requests whose kick was
 * lost. Used by the browser-side reconcile poll and the scheduled cron, so
 * progress no longer depends on someone keeping the App Builder page open.
 */
export async function reconcileAppBuilderWork(targetAssetIds: readonly string[]) {
  const recovered = await recoverStalledAppBuilderRequests();
  const scope = [...new Set([...targetAssetIds, ...recovered])];
  if (!scope.length) return;
  const [responseIds, publishingIds] = await Promise.all([
    listRecoverableAppBuilderResponses(scope),
    listAppBuilderPublishingRequestIds(scope),
  ]);
  for (const id of responseIds) await continueAppBuilderResponse(id, "reconcile");
  for (const id of publishingIds) {
    const request = await findAppBuilderRequestById(id);
    if (request?.status === "reversing") await continueAppBuilderReversal(id);
    else await publishAppBuilderRequest(id);
  }
  for (const targetAssetId of scope) await kickAppBuilderQueue(targetAssetId);
}

export async function continueAppBuilderResponse(responseId: string, eventType: string) {
  const existing = await findAppBuilderRequestByResponse(responseId);
  if (!existing) return false;
  if (existing.status !== "waiting_openai") return true;
  const response = await retrieveResponse(responseId);
  if (eventType === "reconcile" && response.status && !["completed", "failed", "incomplete", "cancelled"].includes(response.status)) return true;
  const request = await claimAppBuilderResponse(responseId);
  if (!request) return true;
  try {
    if (response.status !== "completed") throw new Error(response.error?.message ?? `AI processing ended with ${response.status ?? eventType}.`);
    const staged = await loadAppBuilderStagedChanges(request.id);
    const calls = (response.output ?? []).filter((item) => item.type === "function_call");
    const outputs: Array<{ type: "function_call_output"; call_id: string; output: string }> = [];
    let final: FinalResult | undefined;
    if (!calls.length) {
      const summary = responseText(response);
      if (!summary) throw new Error("The AI stopped without a usable result.");
      final = { blocked: true, title: `Review ${request.targetName} request`, summary };
    }
    for (const call of calls) {
      if (!call.call_id) throw new Error("The AI returned an incomplete tool call.");
      const result = await runAppBuilderTool({ name: call.name ?? "", args: JSON.parse(call.arguments ?? "{}"), repositoryPath: request.repositoryPath, staged });
      if (call.name === "finish") final = result as FinalResult;
      outputs.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
    }
    await updateAppBuilderRequest(request.id, { staged, detail: progressDetail(calls.map((call) => call.name ?? "")) });
    if (final) { await finish(request, staged, final); return true; }
    if (request.turn >= APP_BUILDER_MAX_TURNS) throw new Error("The request used its full processing budget without finishing. Split the brief into smaller, more specific requests.");
    const next = await createResponse({ request, input: outputs, previousResponseId: responseId });
    await updateAppBuilderRequest(request.id, { status: "waiting_openai", detail: "Continuing the proposed update", responseId: next.id, turn: request.turn + 1, staged });
    return true;
  } catch (error) { await fail(request.id, request.targetAssetId, error); return true; }
}

async function finish(request: AppBuilderRequest, staged: Record<string, string>, result: FinalResult) {
  if (result.blocked || !Object.keys(staged).length) {
    await updateAppBuilderRequest(request.id, { status: "failed", detail: "Stopped safely — the request could not be applied automatically", summary: result.summary });
    await deleteAppBuilderPdf(request.id);
    await kickAppBuilderQueue(request.targetAssetId);
    return;
  }
  await updateAppBuilderRequest(request.id, { status: "preparing_review", detail: "Preparing the protected change" });
  const branch = `codex/app-builder-${request.id.slice(0, 8)}`;
  let pull: { branch: string; number: number; url: string };
  if (request.pullNumber && request.pullUrl && request.branch) {
    await updateGitHubPullRequestFiles({
      repositoryPath: request.repositoryPath,
      pullNumber: request.pullNumber,
      title: result.title.slice(0, 120),
      files: staged,
    });
    pull = { branch: request.branch, number: request.pullNumber, url: request.pullUrl };
  } else {
    pull = await prepareGitHubPullRequest({
      repositoryPath: request.repositoryPath, branch,
      title: result.title.slice(0, 120),
      body: `Requested in Cove App Builder by ${request.requestedByName}.\n\nSource: ${request.filename}\n\n${result.summary}\n\nCove will publish this protected change automatically and retain an exact reversal path.`,
      files: staged,
    });
  }
  await updateAppBuilderRequest(request.id, { status: "publishing", detail: "Checking and publishing the update", branch: pull.branch, pullNumber: pull.number, pullUrl: pull.url, summary: result.summary });
  await deleteAppBuilderPdf(request.id);
  await publishAppBuilderRequest(request.id);
}

export async function publishAppBuilderRequest(id: string) {
  const request = await findAppBuilderRequestById(id);
  if (!request || !request.pullNumber || !["needs_approval", "publishing"].includes(request.status)) return false;
  if (request.status === "needs_approval") {
    await updateAppBuilderRequest(id, { status: "publishing", detail: "Publishing the protected change" });
  }
  try {
    const checks = await getPullRequestChecks(request.repositoryPath, request.pullNumber);
    if (checks.merged) {
      if (!checks.mergeCommitSha) throw new Error("GitHub did not return the published commit identifier.");
      await updateAppBuilderRequest(id, { status: "live", detail: "Published — reversal remains available", publishedCommitSha: checks.mergeCommitSha });
      await kickAppBuilderQueue(request.targetAssetId);
      return true;
    }
    if (checks.state === "closed") throw new Error("The protected change was closed without publishing.");
    if (checks.failing > 0) {
      if (request.turn >= APP_BUILDER_MAX_TURNS) throw new Error("Repository checks kept failing after repeated repair attempts. Nothing was published.");
      const evidence = checks.failureDetails.length
        ? checks.failureDetails.join("\n\n").slice(0, 12_000)
        : "A required repository check failed without returning detailed annotations.";
      const next = await createResponse({
        request,
        input: [{ role: "user", content: [{ type: "input_text", text: `The repository checks found issues in the proposed update. Fix the staged files, run review_changes again, and finish when the update is ready. Do not discard the requested work.\n\nCheck evidence:\n${evidence}` }] }],
        previousResponseId: request.responseId,
      });
      await updateAppBuilderRequest(id, {
        status: "waiting_openai",
        detail: "Fixing issues found by repository checks",
        responseId: next.id,
        turn: request.turn + 1,
      });
      return true;
    }
    if (checks.pending > 0) {
      await updateAppBuilderRequest(id, { status: "publishing", detail: "Waiting for repository checks" });
      return true;
    }
    const merged = await approveAndMergePullRequest({
      repositoryPath: request.repositoryPath,
      pullNumber: request.pullNumber,
      commitTitle: `App Builder: ${request.targetName}`,
    });
    await updateAppBuilderRequest(id, { status: "live", detail: "Published — reversal remains available", publishedCommitSha: merged.commitSha });
    await kickAppBuilderQueue(request.targetAssetId);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 700) : "The change could not be published.";
    if (/required status|checks.*pending|not mergeable/i.test(message)) {
      await updateAppBuilderRequest(id, { status: "publishing", detail: "Waiting for repository checks" });
      return true;
    }
    await fail(id, request.targetAssetId, error);
    return false;
  }
}

export async function reverseAppBuilderRequest(id: string, userId: string) {
  const request = await claimAppBuilderReversal(id, userId);
  if (!request || !request.pullNumber) throw new Error("This published change is not available to reverse.");
  try {
    if (!request.reversalPullNumber) {
      const reversal = await prepareGitHubRevertPullRequest({
        repositoryPath: request.repositoryPath,
        originalPullNumber: request.pullNumber,
        branch: `codex/app-builder-reverse-${request.id.slice(0, 8)}`,
        title: `Reverse App Builder change for ${request.targetName}`,
        body: `Exact reversal requested in Cove App Builder.\n\nOriginal request: ${request.filename}\nRequested by: ${request.requestedByName}`,
      });
      await updateAppBuilderRequest(id, {
        status: "reversing",
        detail: "Restoring the previous version",
        reversalPullNumber: reversal.number,
        reversalPullUrl: reversal.url,
      });
    }
    return continueAppBuilderReversal(id);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 700) : "The change could not be reversed.";
    await updateAppBuilderRequest(id, { status: "live", detail: "Reverse failed — the published change remains live", error: message });
    throw error;
  }
}

export async function continueAppBuilderReversal(id: string) {
  const request = await findAppBuilderRequestById(id);
  if (!request || request.status !== "reversing" || !request.reversalPullNumber) return false;
  try {
    const checks = await getPullRequestChecks(request.repositoryPath, request.reversalPullNumber);
    if (checks.merged) {
      if (!checks.mergeCommitSha) throw new Error("GitHub did not return the reversal commit identifier.");
      await updateAppBuilderRequest(id, { status: "reversed", detail: "Previous version restored", reversedCommitSha: checks.mergeCommitSha, reversed: true });
      await kickAppBuilderQueue(request.targetAssetId);
      return true;
    }
    if (checks.state === "closed") throw new Error("The reversal was closed before it could be applied.");
    if (checks.failing > 0) throw new Error("Reversal checks failed; the published change remains live.");
    if (checks.pending > 0) {
      await updateAppBuilderRequest(id, { status: "reversing", detail: "Checking the exact reversal" });
      return true;
    }
    const merged = await approveAndMergePullRequest({
      repositoryPath: request.repositoryPath,
      pullNumber: request.reversalPullNumber,
      commitTitle: `Reverse App Builder: ${request.targetName}`,
    });
    await updateAppBuilderRequest(id, { status: "reversed", detail: "Previous version restored", reversedCommitSha: merged.commitSha, reversed: true });
    await kickAppBuilderQueue(request.targetAssetId);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 700) : "The change could not be reversed.";
    if (/required status|checks.*pending|not mergeable/i.test(message)) {
      await updateAppBuilderRequest(id, { status: "reversing", detail: "Waiting for reversal checks" });
      return true;
    }
    await updateAppBuilderRequest(id, { status: "live", detail: "Reverse failed — the published change remains live", error: message });
    return false;
  }
}

async function fail(id: string, targetAssetId: string, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 700) : "Unknown processing error.";
  console.error("[app-builder] request failed", { id, message });
  await updateAppBuilderRequest(id, { status: "failed", detail: "Stopped safely — nothing was published", error: message });
  await deleteAppBuilderPdf(id).catch(() => undefined);
  // A dead request must not leave its unpublished pull request and branch
  // behind; the next attempt gets a fresh id and a fresh pull request.
  const request = await findAppBuilderRequestById(id).catch(() => null);
  if (request?.pullNumber && !request.publishedCommitSha) {
    await closeGitHubPullRequest({
      repositoryPath: request.repositoryPath,
      pullNumber: request.pullNumber,
      branch: request.branch,
    }).catch((closeError) => console.error("[app-builder] pull request cleanup failed", { id, closeError }));
  }
  await kickAppBuilderQueue(targetAssetId);
}

async function createResponse(input: { request: AppBuilderRequest; input: unknown[]; previousResponseId?: string }) {
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${required("OPENAI_API_KEY")}`, "Content-Type": "application/json" }, body: JSON.stringify({
    model: process.env.OPENAI_CODING_MODEL ?? "gpt-5.6-sol", instructions: APP_BUILDER_PROMPT,
    input: input.input, previous_response_id: input.previousResponseId,
    background: true, store: false, reasoning: { effort: "medium" }, text: { verbosity: "low" },
    safety_identifier: `${input.request.targetSlug}:${input.request.id}`, tools: APP_BUILDER_TOOLS, tool_choice: "auto",
    metadata: { app_builder_request_id: input.request.id },
  }) });
  const result = await response.json() as AgentResponse;
  if (!response.ok || !result.id) throw new Error(result.error?.message ?? `OpenAI returned HTTP ${response.status}.`);
  return result;
}

async function retrieveResponse(id: string) {
  const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${required("OPENAI_API_KEY")}` }, cache: "no-store" });
  const result = await response.json() as AgentResponse;
  if (!response.ok) throw new Error(result.error?.message ?? `OpenAI returned HTTP ${response.status}.`);
  return result;
}

function required(name: string) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is not configured.`); return value; }
function progressDetail(names: string[]) { return names.includes("review_changes") ? "Reviewing the proposed change" : names.some((name) => name === "replace_in_file" || name === "create_file") ? "Making the requested changes" : "Inspecting the app safely"; }
