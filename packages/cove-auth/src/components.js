import React from "react";
import { SignOutButton } from "@clerk/nextjs";

const shellStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "32px 20px",
  background: "linear-gradient(145deg, #06172f 0%, #0b2b4b 58%, #0c3a4b 100%)",
  color: "#f7fbff",
  fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
};
const cardStyle = {
  width: "min(100%, 560px)",
  padding: "34px",
  border: "1px solid rgba(255,255,255,.14)",
  borderRadius: "24px 24px 8px 24px",
  background: "rgba(8, 27, 51, .88)",
  boxShadow: "0 28px 70px rgba(0,0,0,.28)",
};
const eyebrowStyle = { margin: "0 0 18px", color: "#58d8c0", fontSize: "12px", fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" };
const titleStyle = { margin: 0, fontSize: "clamp(26px, 5vw, 40px)", lineHeight: 1.05, letterSpacing: "-.035em" };
const copyStyle = { margin: "16px 0 0", color: "#b9cad9", fontSize: "16px", lineHeight: 1.6 };
const actionStyle = { display: "inline-flex", marginTop: "24px", padding: "12px 17px", border: 0, borderRadius: "12px 12px 4px 12px", background: "#58d8c0", color: "#06243b", font: "inherit", fontWeight: 700, textDecoration: "none", cursor: "pointer" };

const STATE_COPY = Object.freeze({
  signed_out: {
    eyebrow: "Cove sign-in required",
    title: "Let’s get you signed in",
    copy: "Use your approved work account in Cove, then return here. Your original page will be preserved.",
  },
  unauthorized: {
    eyebrow: "Access not available",
    title: "This application isn’t in your Cove access",
    copy: "You’re signed in, but your current User or Admin provision does not include this application. Ask a Cove administrator if you believe this should change.",
  },
  configuration: {
    eyebrow: "Setup needs attention",
    title: "Cove sign-in isn’t ready here yet",
    copy: "This application’s secure Cove connection is incomplete. The application owner can see the exact setup item in SuperPanel.",
  },
  service_unavailable: {
    eyebrow: "Cove is temporarily unavailable",
    title: "We can’t confirm access right now",
    copy: "Access has been stopped safely while Cove is unavailable. Please try again in a moment; no permissions have been changed.",
  },
});

export function CoveAccessState({ kind, message, coveUrl, retryUrl }) {
  const copy = STATE_COPY[kind] || STATE_COPY.service_unavailable;
  const action = kind === "signed_out" && coveUrl
    ? React.createElement("a", { href: coveUrl, style: actionStyle }, "Open Cove")
    : retryUrl
      ? React.createElement("a", { href: retryUrl, style: actionStyle }, "Try again")
      : null;
  return React.createElement(
    "main",
    { style: shellStyle },
    React.createElement(
      "section",
      { style: cardStyle, role: kind === "unauthorized" ? "status" : "alert", "aria-live": "polite" },
      React.createElement("p", { style: eyebrowStyle }, copy.eyebrow),
      React.createElement("h1", { style: titleStyle }, copy.title),
      React.createElement("p", { style: copyStyle }, message || copy.copy),
      action,
    ),
  );
}

export function CoveSuiteSignOutButton({ children = "Sign out of Cove", redirectUrl, ...buttonProps }) {
  const coveUrl = redirectUrl || process.env.NEXT_PUBLIC_COVE_PRIMARY_URL || "/";
  return React.createElement(
    SignOutButton,
    { redirectUrl: coveUrl },
    React.createElement("button", { type: "button", ...buttonProps }, children),
  );
}
