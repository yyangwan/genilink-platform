import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { blogArticles } from "@/lib/marketing-content";

import styles from "../blog.module.css";

type BlogArticlePageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export function generateStaticParams() {
  return blogArticles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = blogArticles.find((item) => item.slug === slug);

  if (!article) {
    return {
      title: "文章未找到 - 智链",
    };
  }

  return {
    title: `${article.title} - 智链`,
    description: article.description,
  };
}

export default async function BlogArticlePage({ params }: BlogArticlePageProps) {
  const { slug } = await params;
  const article = blogArticles.find((item) => item.slug === slug);

  if (!article) {
    notFound();
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <article className={styles.article}>
          <Link href="/blog" className={styles.backLink}>
            <ArrowLeft size={16} />
            返回知识库
          </Link>
          <header className={styles.articleHeader}>
            <span className={styles.meta}>
              {article.category} · {article.readTime}
            </span>
            <h1>{article.title}</h1>
            <p className={styles.articleLead}>{article.description}</p>
          </header>
          <div className={styles.articleBody}>
            {article.sections.map((section) => (
              <section key={section.heading} className={styles.articleSection}>
                <h2>{section.heading}</h2>
                <p>{section.body}</p>
              </section>
            ))}
          </div>
          <footer className={styles.articleFooter}>
            <Link href="/blog">
              <ArrowLeft size={14} />
              查看更多知识文章
            </Link>
            <Link href="/auth/register?source=blog">
              免费诊断官网
              <ArrowRight size={14} />
            </Link>
          </footer>
        </article>
      </div>
    </main>
  );
}
