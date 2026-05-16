"use client";

import React from "react";

/**
 * Skip-to-content link for keyboard/screen-reader users.
 * Rendered once in the root layout, visually hidden until focused.
 */
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="skip-to-content"
    >
      跳到主要内容
    </a>
  );
}
