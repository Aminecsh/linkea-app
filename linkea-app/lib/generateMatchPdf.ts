import jsPDF from "jspdf";

type MatchPdfData = {
  projet: {
    id: string;
    titre: string;
    description?: string;
    stack_souhaitee?: string;
    deadline?: string;
  };
  founder: {
    nom: string;
    ecole?: string;
  };
  dev: {
    nom: string;
    ecole?: string;
    competences?: string[];
    dispo_heures_semaine?: number;
    github?: string;
    linkedin?: string;
  };
  matchDate: string;
};

export function generateMatchPdf(data: MatchPdfData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  const margin = 20;
  const contentW = pageW - margin * 2;
  let y = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const line = (text: string, fontSize = 11, bold = false, color: [number, number, number] = [30, 30, 30]) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(...color);
    doc.text(text, margin, y);
    y += fontSize * 0.45 + 2;
  };

  const wrap = (text: string, fontSize = 10) => {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(text, contentW);
    doc.text(lines, margin, y);
    y += lines.length * (fontSize * 0.45 + 1.5) + 2;
  };

  const hRule = (color: [number, number, number] = [220, 220, 220]) => {
    doc.setDrawColor(...color);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
  };

  const spacer = (mm = 4) => { y += mm; };

  // ── Header ───────────────────────────────────────────────────────────────
  y = 18;
  doc.setFillColor(236, 72, 153); // pink-500
  doc.roundedRect(margin, y - 5, 28, 10, 2, 2, "F");
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Linkea", margin + 4, y + 2.5);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150, 150, 150);
  doc.text(`Généré le ${data.matchDate}`, pageW - margin, y + 2.5, { align: "right" });

  y += 14;
  hRule([236, 72, 153]);

  // ── Titre ────────────────────────────────────────────────────────────────
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 15, 15);
  doc.text("Lettre de mission", margin, y);
  y += 9;

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`Collaboration · Projet "${data.projet.titre}"`, margin, y);
  y += 10;

  hRule();

  // ── Parties ───────────────────────────────────────────────────────────────
  line("Parties impliquées", 13, true, [15, 15, 15]);
  spacer(3);

  // Founder
  doc.setFillColor(250, 245, 255);
  doc.roundedRect(margin, y, contentW / 2 - 3, 22, 3, 3, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(139, 92, 246);
  doc.text("FOUNDER", margin + 4, y + 6);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 15, 15);
  doc.text(data.founder.nom, margin + 4, y + 12);
  if (data.founder.ecole) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(data.founder.ecole, margin + 4, y + 18);
  }

  // Dev
  const devBoxX = margin + contentW / 2 + 3;
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(devBoxX, y, contentW / 2 - 3, 22, 3, 3, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(59, 130, 246);
  doc.text("DÉVELOPPEUR", devBoxX + 4, y + 6);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 15, 15);
  doc.text(data.dev.nom, devBoxX + 4, y + 12);
  if (data.dev.ecole) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(data.dev.ecole, devBoxX + 4, y + 18);
  }

  y += 28;
  hRule();

  // ── Projet ────────────────────────────────────────────────────────────────
  line("Projet", 13, true, [15, 15, 15]);
  spacer(3);

  line(`Titre : ${data.projet.titre}`, 10, true);

  if (data.projet.deadline) {
    line(`Deadline : ${data.projet.deadline}`, 10);
  }

  if (data.projet.stack_souhaitee) {
    line(`Stack : ${data.projet.stack_souhaitee}`, 10);
  }

  if (data.dev.competences?.length) {
    line(`Compétences du dev : ${data.dev.competences.join(", ")}`, 10);
  }

  if (data.dev.dispo_heures_semaine) {
    line(`Disponibilité : ${data.dev.dispo_heures_semaine}h / semaine`, 10);
  }

  spacer(3);

  if (data.projet.description) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("DESCRIPTION", margin, y);
    y += 5;
    wrap(data.projet.description, 10);
  }

  spacer(2);
  hRule();

  // ── Engagements ────────────────────────────────────────────────────────────
  line("Engagements mutuels", 13, true, [15, 15, 15]);
  spacer(3);

  const engagements = [
    `Le founder "${data.founder.nom}" s'engage à fournir un cahier des charges clair, des retours réguliers et à respecter le temps du développeur.`,
    `Le développeur "${data.dev.nom}" s'engage à livrer un MVP fonctionnel dans les délais convenus, à communiquer activement sur l'avancement et à respecter les objectifs du projet.`,
    "Les deux parties s'engagent à communiquer de bonne foi via Linkea et à résoudre tout différend à l'amiable.",
    "Ce document ne constitue pas un contrat de travail. Il matérialise un accord de collaboration entre deux étudiants dans le cadre de la plateforme Linkea (Bêta V1).",
  ];

  for (const eng of engagements) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(236, 72, 153);
    doc.text("•", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(eng, contentW - 6);
    doc.text(lines, margin + 5, y);
    y += lines.length * 5.5 + 3;
  }

  spacer(4);
  hRule();

  // ── Signatures ────────────────────────────────────────────────────────────
  line("Acceptation", 13, true, [15, 15, 15]);
  spacer(4);

  const sigY = y;
  const halfW = contentW / 2 - 10;

  // Founder sig
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, sigY + 14, margin + halfW, sigY + 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 15, 15);
  doc.text(data.founder.nom, margin, sigY + 20);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150, 150, 150);
  doc.text("Founder", margin, sigY + 25);

  // Dev sig
  const sig2X = margin + halfW + 20;
  doc.line(sig2X, sigY + 14, sig2X + halfW, sigY + 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 15, 15);
  doc.text(data.dev.nom, sig2X, sigY + 20);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(150, 150, 150);
  doc.text("Développeur", sig2X, sigY + 25);

  y = sigY + 32;

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text(
    `Linkea Bêta V1 · Document généré automatiquement · Référence projet : ${data.projet.id}`,
    pageW / 2,
    285,
    { align: "center" }
  );

  // ── Téléchargement ────────────────────────────────────────────────────────
  const safeName = data.projet.titre.replace(/[^a-z0-9]/gi, "_").toLowerCase();
  doc.save(`linkea_mission_${safeName}.pdf`);
}
