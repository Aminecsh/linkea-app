import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
      <div className="text-center max-w-lg">
        <span className="label-tag bg-pink-50 text-pink-600 mb-6 inline-flex">
          Bêta V1
        </span>
        <h1 className="text-5xl font-black text-slate-900 tracking-tight leading-none mb-4">
          Linkea
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed mb-10">
          De l&apos;idée au MVP en 4–8 semaines.<br />
          Founders &amp; devs étudiants, ensemble.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/inscription" className="btn-pink">
            Créer un compte
          </Link>
          <Link href="/connexion" className="btn-ghost">
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}
