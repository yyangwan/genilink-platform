import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import styles from "./info-page.module.css";

type InfoSection = {
  title: string;
  body: string;
};

type InfoPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  sections: InfoSection[];
};

export function InfoPage({ eyebrow, title, description, sections }: InfoPageProps) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={16} />
          返回首页
        </Link>
        <header className={styles.header}>
          <span>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <section className={styles.content}>
          {sections.map((section) => (
            <article key={section.title} className={styles.section}>
              <h2>{section.title}</h2>
              <p>{section.body}</p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
