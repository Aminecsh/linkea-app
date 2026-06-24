import jsPDF from "jspdf";

type MatchPdfData = {
  projet: { id: string; titre: string; description?: string; stack_souhaitee?: string; deadline?: string };
  founder: { nom: string; ecole?: string };
  dev: { nom: string; ecole?: string; competences?: string[]; dispo_heures_semaine?: number; github?: string; linkedin?: string };
  matchDate: string;
};

export function generateMatchPdf(data: MatchPdfData) {
  const doc    = new jsPDF({ unit: "mm", format: "a4" });
  const W      = 210;
  const ml     = 24;   // margin left
  const mr     = W - 24; // margin right
  const cw     = mr - ml;
  let y        = 0;

  // ── Micro-helpers ──────────────────────────────────────────────────────────

  const font = (size: number, style: "normal" | "bold" | "italic" = "normal", rgb: [number,number,number] = [20,20,20]) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(...rgb);
  };

  const text = (t: string, x: number, opts?: { align?: "left"|"right"|"center" }) => {
    doc.text(t, x, y, opts);
  };

  const nl = (mm: number) => { y += mm; };

  const rule = (opacity = 0.12) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.setGState(new (doc as unknown as { GState: new (o: object) => object }).GState({ opacity }));
    doc.line(ml, y, mr, y);
    doc.setGState(new (doc as unknown as { GState: new (o: object) => object }).GState({ opacity: 1 }));
    nl(5);
  };

  const kv = (label: string, value: string) => {
    font(8.5, "normal", [120, 120, 120]);
    text(label, ml);
    font(8.5, "normal", [20, 20, 20]);
    text(value, ml + 38);
    nl(5.5);
  };

  const paragraph = (t: string, size = 9.5) => {
    font(size, "normal", [60, 60, 60]);
    const lines = doc.splitTextToSize(t, cw);
    doc.text(lines, ml, y);
    nl(lines.length * (size * 0.42 + 1.2) + 2);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PAGE
  // ══════════════════════════════════════════════════════════════════════════

  y = 20;

  // ── En-tête page ──────────────────────────────────────────────────────────

  font(8, "bold", [20, 20, 20]);
  text("LINKEA", ml);
  font(8, "normal", [160, 160, 160]);
  text(`Généré le ${data.matchDate}`, mr, { align: "right" });
  nl(6);
  rule(0.1);

  // ── Titre ─────────────────────────────────────────────────────────────────

  nl(2);
  font(22, "bold", [10, 10, 10]);
  text("Lettre de mission", ml);
  nl(10);
  font(10, "normal", [100, 100, 100]);
  text(`Collaboration · ${data.projet.titre}`, ml);
  nl(10);
  rule(0.08);

  // ── Parties ───────────────────────────────────────────────────────────────

  nl(2);
  font(7.5, "bold", [140, 140, 140]);
  text("PARTIES", ml);
  nl(6);

  // Deux colonnes texte, pas de boxes
  const col2 = ml + cw / 2 + 6;

  font(7.5, "bold", [120, 120, 120]);
  text("FONDATEUR", ml);
  text("DÉVELOPPEUR", col2);
  nl(5);

  font(10, "bold", [15, 15, 15]);
  text(data.founder.nom, ml);
  text(data.dev.nom, col2);
  nl(5);

  if (data.founder.ecole || data.dev.ecole) {
    font(8.5, "normal", [100, 100, 100]);
    if (data.founder.ecole) text(data.founder.ecole, ml);
    if (data.dev.ecole) text(data.dev.ecole, col2);
    nl(5);
  }

  nl(4);
  rule();

  // ── Objet de la mission ───────────────────────────────────────────────────

  font(7.5, "bold", [140, 140, 140]);
  text("OBJET DE LA MISSION", ml);
  nl(7);

  font(16, "bold", [10, 10, 10]);
  const titleLines = doc.splitTextToSize(data.projet.titre, cw);
  doc.text(titleLines, ml, y);
  nl(titleLines.length * 7 + 4);

  if (data.projet.description) {
    paragraph(data.projet.description);
    nl(2);
  }

  if (data.projet.deadline)              kv("Deadline", data.projet.deadline);
  if (data.dev.dispo_heures_semaine)     kv("Disponibilité", `${data.dev.dispo_heures_semaine}h / semaine`);
  if (data.projet.stack_souhaitee)       kv("Stack", data.projet.stack_souhaitee);
  if (data.dev.competences?.length)      kv("Compétences", data.dev.competences.join(", "));
  if (data.dev.github)                   kv("GitHub", data.dev.github);

  nl(2);
  rule();

  // ── Engagements ───────────────────────────────────────────────────────────

  font(7.5, "bold", [140, 140, 140]);
  text("ENGAGEMENTS MUTUELS", ml);
  nl(7);

  const engagements = [
    `${data.founder.nom} s'engage à fournir un cahier des charges clair, des retours réguliers et à respecter le temps du développeur.`,
    `${data.dev.nom} s'engage à livrer un MVP fonctionnel dans les délais convenus, à communiquer activement sur l'avancement et à respecter les objectifs du projet.`,
    "Les deux parties s'engagent à communiquer de bonne foi via Linkea et à résoudre tout différend à l'amiable.",
    "Ce document ne constitue pas un contrat de travail. Il matérialise un accord de collaboration entre deux étudiants dans le cadre de la plateforme Linkea (Bêta).",
  ];

  for (let i = 0; i < engagements.length; i++) {
    font(9, "normal", [60, 60, 60]);
    const numX = ml;
    const textX = ml + 7;
    const lines = doc.splitTextToSize(engagements[i], cw - 7);
    doc.text(`${i + 1}.`, numX, y);
    doc.text(lines, textX, y);
    nl(lines.length * 5.2 + 4);
  }

  nl(2);
  rule();

  // ── Signatures ────────────────────────────────────────────────────────────

  font(7.5, "bold", [140, 140, 140]);
  text("SIGNATURES", ml);
  nl(12);

  const sigW  = cw / 2 - 10;
  const sig2X = ml + cw / 2 + 10;
  const sigLineY = y + 14;

  // Ligne de signature
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.4);
  doc.line(ml, sigLineY, ml + sigW, sigLineY);
  doc.line(sig2X, sigLineY, sig2X + sigW, sigLineY);

  nl(18);

  font(9, "bold", [15, 15, 15]);
  text(data.founder.nom, ml);
  text(data.dev.nom, sig2X);
  nl(5);

  font(8, "normal", [120, 120, 120]);
  text("Fondateur", ml);
  text("Développeur", sig2X);
  nl(5);

  if (data.founder.ecole) {
    font(8, "normal", [160, 160, 160]);
    text(data.founder.ecole, ml);
  }
  if (data.dev.ecole) {
    font(8, "normal", [160, 160, 160]);
    text(data.dev.ecole, sig2X);
  }

  // ── Pied de page ──────────────────────────────────────────────────────────

  font(7.5, "normal", [190, 190, 190]);
  doc.text(
    `Linkea · Document non juridiquement contraignant · Réf. ${data.projet.id}`,
    W / 2,
    284,
    { align: "center" }
  );

  // ── Export ────────────────────────────────────────────────────────────────

  const safeName = data.projet.titre.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  doc.save(`linkea_mission_${safeName}.pdf`);
}
