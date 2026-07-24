"use client";

import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import styles from "./applicant-experience.module.css";

type SourceState = {
  name: "Leatherback" | "Infostud";
  state: "Live" | "Not detected";
  detail: string;
  url?: string;
};

type Role = {
  id: string;
  title: string;
  team: string;
  arrangement: string;
  location: string;
  salary: string;
  intro: string;
  skills: string[];
  sourceStates: SourceState[];
};

const roles: Role[] = [
  {
    id: "trip-design-assistant",
    title: "Trip Design Assistant",
    team: "Trip Design",
    arrangement: "Full-time · Remote",
    location: "Europe",
    salary: "€1,237 gross / month",
    intro: "Help shape immersive journeys, keep trip information beautifully accurate, and turn destination research into experiences guests remember for years.",
    skills: ["Destination research", "Detail obsessed", "Clear communicator"],
    sourceStates: [
      { name: "Leatherback", state: "Live", detail: "Listed on careers site", url: "https://leatherbacktravel.com/job-openings" },
      { name: "Infostud", state: "Live", detail: "Published 16 Jul 2026", url: "https://poslovi.infostud.com/posao/trip-design-assistant-remote-europe-based/leatherback-travel/741508" },
    ],
  },
  {
    id: "operations-assistant",
    title: "Operations Assistant",
    team: "Operations",
    arrangement: "Remote",
    location: "Europe",
    salary: "Role page has full details",
    intro: "Keep the moving parts behind extraordinary trips calm, clear and on time—from guest details to partner coordination.",
    skills: ["Operational judgement", "Travel experience", "Calm under pressure"],
    sourceStates: [
      { name: "Leatherback", state: "Live", detail: "Listed on careers site", url: "https://leatherbacktravel.com/job-openings" },
      { name: "Infostud", state: "Not detected", detail: "Awaiting source sync" },
    ],
  },
  {
    id: "bookkeeping-coordinator",
    title: "Bookkeeping Coordinator",
    team: "Finance",
    arrangement: "Remote",
    location: "Europe",
    salary: "Role page has full details",
    intro: "Be the behind-the-scenes wizard who keeps supplier payments, reimbursements and the numbers that power every journey running smoothly.",
    skills: ["Bookkeeping", "Systematic thinker", "Trusted follow-through"],
    sourceStates: [
      { name: "Leatherback", state: "Live", detail: "Listed on careers site", url: "https://leatherbacktravel.com/job-openings" },
      { name: "Infostud", state: "Not detected", detail: "Awaiting source sync" },
    ],
  },
  {
    id: "paid-internship",
    title: "Marketing or Trip Design Internship",
    team: "Early careers",
    arrangement: "Part-time · Remote · 3 months",
    location: "Europe · CET hours",
    salary: "€357 gross / month · ~15h / week",
    intro: "Learn the operating rhythm of a fast-growing adventure travel group while contributing practical work in marketing or trip design.",
    skills: ["Curious learner", "Tech confident", "Strong written English"],
    sourceStates: [
      { name: "Leatherback", state: "Live", detail: "Listed on careers site", url: "https://leatherbacktravel.com/job-openings/paid-internships-marketing-or-trip-design-europe" },
      { name: "Infostud", state: "Not detected", detail: "Awaiting source sync" },
    ],
  },
];

const teams = ["All roles", "Trip Design", "Operations", "Finance", "Early careers"];

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
}

function PaperclipIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.5 12.5 5.8-5.8a3 3 0 0 1 4.2 4.2l-8.2 8.2a5 5 0 0 1-7-7l8-8" /></svg>;
}

function sourceLabel(source: SourceState) {
  return source.state === "Live" ? `${source.name} · live` : `${source.name} · not detected`;
}

export function ApplicantExperience() {
  const [team, setTeam] = useState("All roles");
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0].id);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "reading" | "ready" | "manual">("idle");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filteredRoles = useMemo(() => roles.filter((role) => team === "All roles" || role.team === team), [team]);
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0];

  function chooseRole(role: Role) {
    setSelectedRoleId(role.id);
    setSubmitted(false);
    document.getElementById("application")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    if (!nextFile) {
      setUploadState("idle");
      return;
    }

    const isPlainText = nextFile.type === "text/plain" || nextFile.name.toLowerCase().endsWith(".txt");
    if (!isPlainText) {
      setUploadState("manual");
      return;
    }

    setUploadState("reading");
    const text = await nextFile.text();
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const foundEmail = text.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] ?? "";
    const foundPhone = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0] ?? "";
    const skillMatches = ["Airtable", "Slack", "Excel", "bookkeeping", "operations", "marketing", "research", "travel", "customer service"]
      .filter((candidate) => text.toLowerCase().includes(candidate.toLowerCase()));

    if (!fullName && lines[0] && lines[0].length < 80) setFullName(lines[0]);
    if (!email && foundEmail) setEmail(foundEmail);
    if (!phone && foundPhone) setPhone(foundPhone);
    if (!summary) setSummary(lines.slice(1, 5).join(" ").slice(0, 420));
    if (!skills && skillMatches.length) setSkills(skillMatches.join(", "));
    setUploadState("ready");
  }

  function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    document.getElementById("application")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="#top" className={styles.brand} aria-label="Leatherback Travel careers home">
          <span className={styles.brandMark}>L</span>
          <span><strong>leatherback</strong><small>travel · people</small></span>
        </a>
        <a className={styles.headerLink} href="#roles">Open roles <ArrowIcon /></a>
      </header>

      <section className={styles.hero} id="top">
        <div className={styles.heroStamp}><span>50+</span> curious people<br />across the world</div>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Careers at Leatherback Travel</p>
          <h1>Build the journeys<br /><em>people keep talking about.</em></h1>
          <p className={styles.heroLead}>We are a remote team turning overlooked places into unforgettable adventures. Bring your judgement, your curiosity and the work you care about doing well.</p>
          <a className={styles.primaryLink} href="#roles">Find your place <ArrowIcon /></a>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <div className={styles.sun} />
          <div className={styles.route}><i /><i /><i /></div>
          <span>43° 30&apos; N</span>
        </div>
      </section>

      <section className={styles.manifesto}>
        <p>Fully remote. Deeply connected.</p>
        <p>Small teams. Proper ownership.</p>
        <p>Travel made with curiosity and respect.</p>
      </section>

      <section className={styles.rolesSection} id="roles">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Open now</p><h2>Choose the work,<br />not just the title.</h2></div>
          <p>Source status is a demonstration snapshot checked 19 July 2026. Always review the linked role page for the latest terms before applying.</p>
        </div>

        <div className={styles.filters} aria-label="Filter roles by team">
          {teams.map((item) => <button type="button" key={item} aria-pressed={team === item} onClick={() => setTeam(item)}>{item}</button>)}
        </div>

        <div className={styles.roleList}>
          {filteredRoles.map((role, index) => (
            <article className={styles.roleCard} key={role.id}>
              <span className={styles.roleNumber}>{String(index + 1).padStart(2, "0")}</span>
              <div className={styles.roleMain}>
                <p>{role.team}</p>
                <h3>{role.title}</h3>
                <div className={styles.roleMeta}><span>{role.arrangement}</span><span>{role.location}</span><span>{role.salary}</span></div>
                <p className={styles.roleIntro}>{role.intro}</p>
                <div className={styles.skillRow}>{role.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
              </div>
              <div className={styles.sourceColumn}>
                <p>Role sources</p>
                {role.sourceStates.map((source) => source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer" key={source.name} className={source.state === "Live" ? styles.sourceLive : styles.sourceQuiet}>
                    <i /> <span><strong>{sourceLabel(source)}</strong><small>{source.detail}</small></span>
                  </a>
                ) : (
                  <span key={source.name} className={styles.sourceQuiet}><i /><span><strong>{sourceLabel(source)}</strong><small>{source.detail}</small></span></span>
                ))}
              </div>
              <button type="button" className={styles.applyButton} onClick={() => chooseRole(role)}>Apply <ArrowIcon /></button>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.applicationSection} id="application">
        {submitted ? (
          <div className={styles.success} role="status">
            <span className={styles.successMark}>✓</span>
            <p className={styles.eyebrow}>Application preview complete</p>
            <h2>Thanks, {fullName.split(" ")[0] || "traveller"}.</h2>
            <p>Your application for <strong>{selectedRole.title}</strong> looks ready. This is a demonstration, so nothing has been sent or stored yet. In production, you would receive an email receipt and the People team would see your application in Cove.</p>
            <div className={styles.successActions}>
              <button type="button" onClick={() => setSubmitted(false)}>Review my details</button>
              <a href="#roles">Explore other roles</a>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.applicationIntro}>
              <p className={styles.eyebrow}>Your application</p>
              <h2>Tell us what<br />we cannot read<br />on a CV.</h2>
              <p>Applying for</p>
              <strong>{selectedRole.title}</strong>
              <small>Usually 6–8 minutes</small>
            </div>

            <form className={styles.form} onSubmit={submitApplication}>
              <fieldset>
                <legend>1 · Start with your CV</legend>
                <button className={styles.upload} type="button" onClick={() => fileRef.current?.click()}>
                  <PaperclipIcon />
                  <span><strong>{file ? file.name : "Drop in your CV"}</strong><small>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · choose another file` : "PDF, DOCX or TXT · maximum 10 MB"}</small></span>
                  <i>Browse</i>
                </button>
                <input ref={fileRef} className={styles.hiddenFile} type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFile} />
                {uploadState === "reading" && <p className={styles.extractNotice}>Reading your text CV in this browser…</p>}
                {uploadState === "ready" && <p className={styles.extractSuccess}>We found a few details. Please check every field—nothing leaves this browser in the demo.</p>}
                {uploadState === "manual" && <p className={styles.extractManual}>File attached. PDF and DOCX extraction is not connected in this demo, so please add or paste the important details below. We will never pretend we read what we could not.</p>}
                <p className={styles.formHint}>Prefer not to upload? That is fine—complete the fields manually and paste a link to your CV or portfolio below.</p>
              </fieldset>

              <fieldset>
                <legend>2 · Check the essentials</legend>
                <div className={styles.twoColumns}>
                  <label><span>Full name</span><input required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} /></label>
                  <label><span>Email</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
                  <label><span>Phone / WhatsApp <small>optional</small></span><input autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
                  <label><span>Location and time zone</span><input required placeholder="e.g. Belgrade · CET" /></label>
                </div>
                <label><span>CV or portfolio link <small>optional fallback</small></span><input type="url" placeholder="https://" /></label>
                <label><span>Experience snapshot</span><textarea required rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="A short, factual summary of the work most relevant to this role." /></label>
                <label><span>Tools and strengths</span><input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder="Airtable, research, guest communication…" /></label>
              </fieldset>

              <fieldset>
                <legend>3 · The part only you can write</legend>
                <label><span>Why this role, and why Leatherback?</span><textarea required rows={6} placeholder="Please address the role criteria in your own voice. Warm, specific and honest beats polished-but-generic." /></label>
                <label><span>Tell us about a detail you caught before it became a problem.</span><textarea required rows={5} /></label>
                <label><span>Anything else we should understand?</span><textarea rows={3} placeholder="Career gaps, access needs, availability, or useful context." /></label>
              </fieldset>

              <fieldset className={styles.consentFieldset}>
                <legend>4 · Your privacy</legend>
                <label className={styles.checkbox}><input required type="checkbox" /><span>I consent to Leatherback Travel using my application data to assess me for this role and contact me about the recruitment process. <strong>Required.</strong></span></label>
                <label className={styles.checkbox}><input type="checkbox" /><span>Keep my details for up to 12 months so the People team can consider me for another suitable role. Optional; declining will not affect this application.</span></label>
                <p>Before production launch, this form needs the final recruitment privacy notice, retention process, deletion contact, secure upload storage and submission endpoint. This demonstration does not transmit or retain your information.</p>
              </fieldset>

              <div className={styles.submitRow}>
                <button type="submit">Preview submission <ArrowIcon /></button>
                <p>We value enthusiasm, but please do not cold-call. Every complete application is reviewed by a person.</p>
              </div>
            </form>
          </>
        )}
      </section>

      <footer className={styles.footer}><strong>Leatherback Travel</strong><span>Turn the overlooked into the unforgettable.</span><a href="mailto:contact@leatherbacktravel.com">contact@leatherbacktravel.com</a></footer>
    </main>
  );
}
