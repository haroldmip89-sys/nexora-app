import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { sanitizeUrl } from "@/lib/markdown";

const heading = "font-heading font-semibold text-[#183D30] scroll-mt-20";

const components: Components = {
  h1: ({ children }) => <h2 className={cn(heading, "mt-6 mb-3 text-xl")}>{children}</h2>,
  h2: ({ children }) => <h2 className={cn(heading, "mt-6 mb-3 text-xl")}>{children}</h2>,
  h3: ({ children }) => <h3 className={cn(heading, "mt-5 mb-2 text-lg")}>{children}</h3>,
  h4: ({ children }) => <h4 className={cn(heading, "mt-4 mb-2 text-base")}>{children}</h4>,
  h5: ({ children }) => <h4 className={cn(heading, "mt-4 mb-2 text-base")}>{children}</h4>,
  h6: ({ children }) => <h4 className={cn(heading, "mt-4 mb-2 text-base")}>{children}</h4>,
  p: ({ children }) => <p className="my-3 leading-7 text-[#202522]">{children}</p>,
  a: ({ href, children }) => {
    if (!href) return <>{children}</>;
    const external = /^https?:/i.test(href);
    return (
      <a
        href={href}
        rel="noopener noreferrer nofollow ugc"
        {...(external ? { target: "_blank" } : {})}
        className="text-[#183D30] underline underline-offset-2 hover:opacity-80"
      >
        {children}
      </a>
    );
  },
  ul: ({ className, children }) => (
    <ul
      className={cn(
        "my-3 space-y-1",
        className?.includes("contains-task-list") ? "list-none pl-0" : "list-disc pl-6",
      )}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>,
  li: ({ children }) => <li className="leading-7 text-[#202522]">{children}</li>,
  input: ({ checked }) => (
    <>
      <input
        type="checkbox"
        checked={!!checked}
        disabled
        readOnly
        aria-hidden="true"
        tabIndex={-1}
        className="mr-2 align-middle"
      />
      <span className="sr-only">{checked ? "Completado: " : "Pendiente: "}</span>
    </>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-[#E3E8E3] pl-4 text-[#535E56]">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[#E3E8E3] bg-[#F0F2EC] px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-[#E3E8E3] px-3 py-2">{children}</td>,
  code: ({ children }) => (
    <code className="rounded bg-[#F0F2EC] px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-lg bg-[#F0F2EC] p-4 text-sm [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-6 border-[#E3E8E3]" />,
  img: ({ alt }) => <>{alt ?? ""}</>,
};

const urlTransform = (url: string) => sanitizeUrl(url) ?? "";

export function MarkdownContent({ source, className }: { source: string; className?: string }) {
  if (!source) return null;
  return (
    <div className={cn("min-w-0 break-words", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
