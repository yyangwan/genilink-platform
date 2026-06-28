// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ContentEditor } from "@/components/content/content-editor";

const setContentMock = vi.fn();
let currentHtml = "<p>Initial</p>";

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => ({
    getHTML: () => currentHtml,
    commands: {
      setContent: (nextContent: string) => {
        setContentMock(nextContent);
        currentHtml = nextContent;
      },
    },
    chain: () => ({
      focus: () => ({
        toggleBold: () => ({ run: vi.fn() }),
        toggleItalic: () => ({ run: vi.fn() }),
        toggleHeading: () => ({ run: vi.fn() }),
        toggleBulletList: () => ({ run: vi.fn() }),
        toggleOrderedList: () => ({ run: vi.fn() }),
        toggleBlockquote: () => ({ run: vi.fn() }),
        undo: () => ({ run: vi.fn() }),
        redo: () => ({ run: vi.fn() }),
      }),
    }),
    isActive: () => false,
  })),
  EditorContent: () => <div data-testid="editor-content" />,
}));

vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tiptap/extension-placeholder", () => ({
  default: {
    configure: vi.fn(() => ({})),
  },
}));

afterEach(() => {
  setContentMock.mockClear();
});

describe("ContentEditor", () => {
  it("syncs async initial content into the editor when the prop changes", () => {
    const { rerender, getByTestId } = render(
      <ContentEditor initialContent="<p>Initial</p>" />,
    );

    expect(getByTestId("editor-content")).toBeTruthy();
    expect(setContentMock).not.toHaveBeenCalled();

    rerender(<ContentEditor initialContent="<p>Loaded content</p>" />);

    expect(setContentMock).toHaveBeenCalledWith("<p>Loaded content</p>");
  });
});
