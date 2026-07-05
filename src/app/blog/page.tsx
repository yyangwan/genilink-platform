import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { blogArticles } from "@/lib/marketing-content";

import styles from "./blog.module.css";

export const metadata: Metadata = {
  title: "AI 搜索与 GEO 知识库 - 智链",
  description: "面向 B2B 市场团队的 AI 搜索、GEO、官网可引用性、内容洞察和竞品分析知识文章。",
};

export default function BlogPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={16} />
          返回首页
        </Link>
        <header className={styles.header}>
          <span className={styles.eyebrow}>知识库</span>
          <h1>AI 搜索与 GEO 增长知识文章</h1>
          <p>
            围绕 AI 搜索可见性、官网诊断、内容策略和竞品分析，整理适合市场团队阅读和转发的基础知识。
          </p>
        </header>
        <section className={styles.grid}>
          {blogArticles.map((article) => (
            <Link key={article.slug} href={`/blog/${article.slug}`} className={styles.card}>
              <span className={styles.meta}>{article.category}</span>
              <h2>{article.title}</h2>
              <p>{article.excerpt}</p>
              <div className={styles.cardFooter}>
                <span>{article.readTime}</span>
                <span>
                  阅读文章
                  <ArrowRight size={14} />
                </span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
