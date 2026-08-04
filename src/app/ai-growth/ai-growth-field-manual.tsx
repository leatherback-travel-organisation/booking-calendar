"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./ai-growth.module.css";

type Focus = "All" | "Demand" | "Conversion" | "Retention" | "Leverage";
type Idea = {
  title: string;
  focus: Exclude<Focus, "All">;
  effort: "1 week" | "2–3 weeks" | "4–6 weeks";
  impact: number;
  note: string;
  system: string;
};

const ideas: Idea[] = [
  { title: "On-page SEO report generator", focus: "Demand", effort: "1 week", impact: 8, note: "Turn every brand site into a prioritised fix list: intent, titles, schema, internal links and conversion gaps.", system: "Weekly crawl → scored brief → owner queue" },
  { title: "Content SEO optimiser", focus: "Demand", effort: "2–3 weeks", impact: 9, note: "Refresh pages against real query intent while preserving each brand’s voice and first-hand travel expertise.", system: "GSC signal → evidence pack → human edit → measure" },
  { title: "AEO / GEO answer engine", focus: "Demand", effort: "4–6 weeks", impact: 10, note: "Publish precise, citable destination and trip answers that search engines and AI assistants can confidently reuse.", system: "Question map → source facts → answer pages → citation test" },
  { title: "Enquiry reply co-pilot", focus: "Conversion", effort: "1 week", impact: 8, note: "Draft fast, brand-right answers with trip facts and a clear next action; a person remains the sender.", system: "Inbox event → grounded draft → approve → CRM log" },
  { title: "Landing-page variant studio", focus: "Conversion", effort: "2–3 weeks", impact: 7, note: "Build controlled headline, proof and itinerary variants around one audience hypothesis at a time.", system: "Hypothesis → variant → split → keep or kill" },
  { title: "Review-to-proof pipeline", focus: "Conversion", effort: "2–3 weeks", impact: 8, note: "Route consented guest language into proof blocks, objections and sales prompts without inventing claims.", system: "Review → permission → theme → approved placement" },
  { title: "Second Adventure recommender", focus: "Retention", effort: "2–3 weeks", impact: 9, note: "Match past guests to their most natural next trip using travel history, preferences and timing.", system: "Guest signal → shortlist → team review → personal outreach" },
  { title: "Pre-departure question miner", focus: "Retention", effort: "1 week", impact: 6, note: "Turn repeated guest questions into better emails, FAQs and trip documentation before support volume grows.", system: "Support themes → frequency → content fix → deflection" },
  { title: "Campaign learning ledger", focus: "Leverage", effort: "1 week", impact: 8, note: "Give every test a durable memory so new work begins with what the company already learned.", system: "Brief → result → decision → reusable pattern" },
  { title: "Automation operations queue", focus: "Leverage", effort: "4–6 weeks", impact: 10, note: "Let small bots watch deadlines, promises and anomalies, then send only decisions—not noise—to people.", system: "Watch → explain → propose → human approval" },
];

const initiatives = [
  { id: "empty-seat", name: "Empty Seat Rescue", window: "14–45 days", value: "Protect trip contribution", description: "Find viable departures below their fill curve, diagnose the most likely friction, and prepare a tightly scoped recovery play—audience, offer, channel and stop rule.", approval: "Approve a two-brand, four-departure pilot. No automatic discounting or publishing.", signal: "Load factor vs historic curve · margin floor · unsold inventory" },
  { id: "second-adventure", name: "Second Adventure", window: "30–120 days", value: "Grow repeat bookings", description: "Create a small, explainable next-trip shortlist for every recently returned guest, then draft truly personal outreach for the booking team to approve.", approval: "Approve a 100-guest retrospective match test. Outreach remains manual.", signal: "Past trips · destinations · pace · season · spend · feedback" },
  { id: "supplier-promise", name: "Supplier Promise Watch", window: "Always on", value: "Prevent guest disappointment", description: "Compare sold itinerary promises with supplier confirmations and recent operational changes, surfacing mismatches while there is still time to fix them.", approval: "Approve read-only monitoring on one operating brand. Escalations go to an owner.", signal: "Itinerary copy · confirmations · amendments · departure date" },
] as const;

const roadmap = [
  { phase: "Days 1–30", title: "Build the signal layer", tasks: ["Name one accountable owner per brand", "Connect search, content, enquiry and booking baselines", "Ship SEO reporter and Campaign Learning Ledger", "Label 100 examples for safe evaluation"] },
  { phase: "Days 31–60", title: "Create repeatable machines", tasks: ["Launch content optimiser with human publishing", "Pilot Empty Seat Rescue and Second Adventure", "Build answer-page templates and fact sources", "Measure time saved, conversion lift and error rate"] },
  { phase: "Days 61–90", title: "Scale what earned it", tasks: ["Promote winning pilots into governed automations", "Add Supplier Promise Watch read-only pilot", "Retire low-value reports and duplicate rituals", "Set quarterly model, privacy and brand-quality review"] },
] as const;

export function AiGrowthFieldManual() {
  const [focus, setFocus] = useState<Focus>("All");
  const [approved, setApproved] = useState<string[]>([]);
  const [phase, setPhase] = useState(0);
  const visibleIdeas = useMemo(() => ideas.filter((idea) => focus === "All" || idea.focus === focus), [focus]);

  function toggleApproval(id: string) {
    setApproved((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <main className={styles.manual}>
      <div className={styles.grain} aria-hidden="true" />
      <nav className={styles.nav} aria-label="AI growth manual navigation">
        <Link href="/" className={styles.wordmark}>Leatherback <i>Field Notes</i></Link>
        <div><a href="#opportunities">Ideas</a><a href="#operating-model">Operating model</a><a href="#roadmap">90 days</a></div>
        <span className={styles.issue}>Issue 01 · Growth without bloat</span>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroIndex}><span>AI × MARKETING</span><b>01</b></div>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>A practical field manual for Leatherback</p>
          <h1>Make the team<br /><em>feel enormous.</em></h1>
          <p className={styles.lede}>The goal is not more content. It is more useful decisions, more personal guest moments and fewer valuable things quietly falling through the cracks.</p>
          <div className={styles.heroActions}><a href="#initiatives">Choose a pilot</a><a href="#roadmap" className={styles.secondary}>See the 90-day plan</a></div>
        </div>
        <aside className={styles.manifesto}>
          <span>Operating thesis</span>
          <p>Automate the hunt.<br />Keep humans on the promise.</p>
          <ul><li>Machines gather and compare.</li><li>People judge and communicate.</li><li>Every system leaves evidence.</li></ul>
        </aside>
      </header>

      <section className={styles.principles} aria-label="Growth principles">
        <article><b>01</b><h2>Revenue before volume</h2><p>Prioritise filled seats, better conversion and repeat guests over vanity output.</p></article>
        <article><b>02</b><h2>Evidence before generation</h2><p>Give AI facts, constraints and examples before asking it to make anything.</p></article>
        <article><b>03</b><h2>Approval before consequence</h2><p>Drafts can be automatic. Prices, promises and guest messages cannot.</p></article>
      </section>

      <section className={styles.opportunities} id="opportunities">
        <header className={styles.sectionHeader}><div><span>THE SHORTLIST</span><h2>Low-hanging fruit,<br />ranked for reality.</h2></div><p>Filter by the commercial job. Impact scores are directional—each idea still has to earn its place through a measured pilot.</p></header>
        <div className={styles.filters} role="group" aria-label="Filter ideas by focus">
          {(["All", "Demand", "Conversion", "Retention", "Leverage"] as Focus[]).map((item) => <button key={item} type="button" aria-pressed={focus === item} onClick={() => setFocus(item)}>{item}</button>)}
        </div>
        <div className={styles.ideaGrid}>
          {visibleIdeas.map((idea, index) => <article className={styles.idea} key={idea.title} style={{ "--delay": `${index * 45}ms` } as React.CSSProperties}>
            <div className={styles.ideaMeta}><span>{idea.focus}</span><small>{idea.effort}</small></div>
            <h3>{idea.title}</h3><p>{idea.note}</p><div className={styles.system}><span>{idea.system}</span><b aria-label={`Impact ${idea.impact} out of 10`}>{idea.impact}<i>/10</i></b></div>
          </article>)}
        </div>
      </section>

      <section className={styles.operating} id="operating-model">
        <div className={styles.operatingTitle}><span>THE NO-NEW-SEATS MODEL</span><h2>Scale output.<br /><em>Not payroll.</em></h2><p>Organise work into four layers. The team spends less time collecting and formatting, and more time making the calls only they can make.</p></div>
        <ol className={styles.layers}>
          <li><b>01</b><div><h3>Sense</h3><p>Bots watch search demand, content decay, enquiries, bookings, reviews and operational promises.</p></div><span>Continuous</span></li>
          <li><b>02</b><div><h3>Explain</h3><p>Systems show what changed, why it matters, confidence and the source evidence.</p></div><span>Automatic</span></li>
          <li><b>03</b><div><h3>Propose</h3><p>AI prepares a fix, brief, reply or prioritised action with clear guardrails.</p></div><span>Automatic</span></li>
          <li><b>04</b><div><h3>Commit</h3><p>A named person approves anything that changes a price, promise, relationship or public claim.</p></div><span>Human</span></li>
        </ol>
        <div className={styles.capacityMath}><span>One team, four multipliers</span><div><b>Find</b><i>×</i><b>Focus</b><i>×</i><b>Finish</b><i>×</i><b>Learn</b></div><p>Do not count “assets generated.” Count hours returned, opportunities recovered, conversion gained and errors prevented.</p></div>
      </section>

      <section className={styles.initiatives} id="initiatives">
        <header className={styles.sectionHeader}><div><span>ONE-CLICK DECISIONS</span><h2>Three pilots ready<br />for a yes.</h2></div><p>Approval here is a planning signal, not an external action. Each pilot begins read-only and has a named stop rule.</p></header>
        <div className={styles.initiativeList}>
          {initiatives.map((initiative, index) => { const isApproved = approved.includes(initiative.id); return <article key={initiative.id} className={isApproved ? styles.approved : ""}>
            <div className={styles.initiativeNumber}>0{index + 1}</div>
            <div className={styles.initiativeBody}><div className={styles.initiativeMeta}><span>{initiative.value}</span><small>{initiative.window}</small></div><h3>{initiative.name}</h3><p>{initiative.description}</p><dl><div><dt>Signal</dt><dd>{initiative.signal}</dd></div><div><dt>Approval ask</dt><dd>{initiative.approval}</dd></div></dl></div>
            <button type="button" onClick={() => toggleApproval(initiative.id)} aria-pressed={isApproved}><span>{isApproved ? "Approved for pilot" : "Approve pilot"}</span><b>{isApproved ? "✓" : "→"}</b></button>
          </article>; })}
        </div>
        {approved.length > 0 && <div className={styles.approvalNote} role="status"><b>{approved.length} pilot{approved.length === 1 ? "" : "s"} selected</b><span>Selections stay in this browser session only. A production approval workflow should record owner, budget, scope and audit history.</span></div>}
      </section>

      <section className={styles.roadmap} id="roadmap">
        <header><span>THE FIRST QUARTER</span><h2>90 days to a compounding system.</h2></header>
        <div className={styles.roadmapTabs} role="tablist" aria-label="90 day roadmap phases">
          {roadmap.map((item, index) => <button key={item.phase} type="button" role="tab" aria-selected={phase === index} onClick={() => setPhase(index)}><b>{item.phase}</b><span>{item.title}</span></button>)}
        </div>
        <article className={styles.roadmapDetail} role="tabpanel">
          <div><span>0{phase + 1}</span><h3>{roadmap[phase].title}</h3><p>{roadmap[phase].phase}</p></div>
          <ol>{roadmap[phase].tasks.map((task, index) => <li key={task}><b>{index + 1}</b><span>{task}</span></li>)}</ol>
        </article>
      </section>

      <footer className={styles.footer}><div><b>Start small enough to learn.</b><p>Scale only what makes the guest experience or the company economics measurably better.</p></div><a href="#initiatives">Back to the pilots ↑</a></footer>
    </main>
  );
}

