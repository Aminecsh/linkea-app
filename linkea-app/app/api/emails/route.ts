import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const DEV_MODE = process.env.NODE_ENV !== "production";
const DEV_EMAIL = "amine.chamssan@gmail.com";

export async function POST(req: NextRequest) {
  const { type, to, data } = await req.json();
  const recipient = DEV_MODE ? DEV_EMAIL : to;

  try {
    if (type === "nouvelle_candidature") {
      await resend.emails.send({
        from: "Linkea <onboarding@resend.dev>",
        to: recipient,
        subject: `Nouveau candidat sur ton projet "${data.projetTitre}"`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ec4899; margin-bottom: 24px;">Linkea</p>
            <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">Nouveau candidat 🎉</h1>
            <p style="color: #64748b; margin-bottom: 24px;">
              <strong>${data.devNom}</strong> a candidaté sur ton projet <strong>"${data.projetTitre}"</strong>.
            </p>
            <div style="background: #f8fafc; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
              <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>École :</strong> ${data.devEcole ?? "—"}</p>
              <p style="margin: 8px 0 0; font-size: 13px; color: #64748b;"><strong>Compétences :</strong> ${data.devCompetences ?? "—"}</p>
            </div>
            <a href="https://linkea-app.vercel.app/projets/${data.projetId}/candidats"
               style="display: inline-block; background: linear-gradient(145deg, #be185d, #ec4899); color: white; font-weight: 700; padding: 14px 28px; border-radius: 12px; text-decoration: none;">
              Voir les candidats →
            </a>
          </div>
        `,
      });
    }

    if (type === "candidature_acceptee") {
      await resend.emails.send({
        from: "Linkea <onboarding@resend.dev>",
        to: recipient,
        subject: `Ta candidature a été acceptée ! 🎉`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ec4899; margin-bottom: 24px;">Linkea</p>
            <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">Félicitations ! 🚀</h1>
            <p style="color: #64748b; margin-bottom: 24px;">
              Le founder a accepté ta candidature pour le projet <strong>"${data.projetTitre}"</strong>.
              L'équipe Linkea va vous mettre en contact pour démarrer.
            </p>
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
              <p style="margin: 0; font-size: 13px; color: #16a34a; font-weight: 600;">✓ Candidature acceptée</p>
              <p style="margin: 4px 0 0; font-size: 13px; color: #64748b;">${data.projetTitre}</p>
            </div>
            <a href="https://linkea-app.vercel.app/profil"
               style="display: inline-block; background: linear-gradient(145deg, #be185d, #ec4899); color: white; font-weight: 700; padding: 14px 28px; border-radius: 12px; text-decoration: none;">
              Voir mon profil →
            </a>
          </div>
        `,
      });
    }

    if (type === "candidature_refusee") {
      await resend.emails.send({
        from: "Linkea <onboarding@resend.dev>",
        to: recipient,
        subject: `Mise à jour sur ta candidature`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ec4899; margin-bottom: 24px;">Linkea</p>
            <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin-bottom: 8px;">Candidature non retenue</h1>
            <p style="color: #64748b; margin-bottom: 24px;">
              Ta candidature pour le projet <strong>"${data.projetTitre}"</strong> n'a pas été retenue cette fois.
              D'autres projets t'attendent !
            </p>
            <a href="https://linkea-app.vercel.app/projets"
               style="display: inline-block; background: linear-gradient(145deg, #be185d, #ec4899); color: white; font-weight: 700; padding: 14px 28px; border-radius: 12px; text-decoration: none;">
              Voir les projets →
            </a>
          </div>
        `,
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
