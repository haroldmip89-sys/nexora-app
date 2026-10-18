import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TagPicker } from "@/components/shared/tag-picker";

const OPTIONS = [
  { value: "react", label: "React" },
  { value: "nodejs", label: "Node.js" },
  { value: "otros", label: "Otros" },
];

afterEach(cleanup);

describe("TagPicker", () => {
  it("renders a fieldset with legend and one named checkbox per option", () => {
    render(<TagPicker name="technologies" legend="Tecnologías" options={OPTIONS} />);
    expect(screen.getByRole("group", { name: "Tecnologías" })).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(3);
    expect(boxes.every((b) => b.name === "technologies")).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Node.js" })).toBeTruthy();
  });

  it("checks defaultSelected values only", () => {
    render(
      <TagPicker name="tech" legend="T" options={OPTIONS} defaultSelected={["react", "otros"]} />,
    );
    const checked = (screen.getAllByRole("checkbox") as HTMLInputElement[])
      .filter((b) => b.checked)
      .map((b) => b.value);
    expect(checked).toEqual(["react", "otros"]);
  });

  it("disables the group", () => {
    render(<TagPicker name="tech" legend="T" options={OPTIONS} disabled />);
    expect((screen.getByRole("group") as HTMLFieldSetElement).disabled).toBe(true);
  });

  it("wires hint and error with aria-describedby", () => {
    render(<TagPicker name="tech" legend="T" options={OPTIONS} hint="Elige 1 a 10" error="Falta" />);
    const group = screen.getByRole("group");
    const ids = (group.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0])?.textContent).toBe("Elige 1 a 10");
    expect(screen.getByRole("alert").textContent).toBe("Falta");
  });
});
