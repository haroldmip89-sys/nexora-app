import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const rest = { ...props };
    delete rest.fill;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(rest as object)} />;
  },
}));

import { UserAvatar } from "./user-avatar";

const URL_OK = "https://img.clerk.com/abc123";

describe("UserAvatar", () => {
  it("renders the photo with empty alt inside an aria-hidden container", () => {
    const { container } = render(<UserAvatar name="Ada Lovelace" imageUrl={URL_OK} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("src")).toBe(URL_OK);
    expect(img?.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(container.textContent).toBe("");
  });

  it("falls back to initials without a URL", () => {
    const { container } = render(<UserAvatar name="Ada Lovelace" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("AL");
    const nullUrl = render(<UserAvatar name="Ada Lovelace" imageUrl={null} />);
    expect(nullUrl.container.querySelector("img")).toBeNull();
  });

  it("falls back to initials for a host that is not allowed", () => {
    const { container } = render(
      <UserAvatar name="Ada Lovelace" imageUrl="https://evil.com/img.clerk.com" />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("AL");
  });

  it("falls back to initials after the image errors", () => {
    const { container } = render(<UserAvatar name="Ada Lovelace" imageUrl={URL_OK} />);
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("AL");
  });

  it("lets className override the size classes", () => {
    const { container } = render(
      <UserAvatar name="Ada Lovelace" imageUrl={URL_OK} size="sm" className="size-9" />,
    );
    const cls = (container.firstElementChild as HTMLElement).className;
    expect(cls).toContain("size-9");
    expect(cls).not.toContain("size-[30px]");
  });
});
