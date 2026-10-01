import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import FloatingMenu from "@/components/ui/liquid-morph-floating-menu";

const POSTER =
  "https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/693205bf-8048-456a-879e-4e0a1b85a098.webp";
const VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_123836_11a3c5e0-713f-4bef-a8e9-7dd93bdea3b0.mp4";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nexeus — Build your future now" },
      {
        name: "description",
        content:
          "From branding and websites to marketing and growth systems, everything you need to move forward starts right here.",
      },
      { property: "og:title", content: "Nexeus — Build your future now" },
      {
        property: "og:description",
        content:
          "From branding and websites to marketing and growth systems, everything you need to move forward starts right here.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: POSTER },
      { name: "twitter:image", content: POSTER },
    ],
  }),
  component: Index,
});

const COLS = [
  { c: "c1", h: "SOLUTIONS", items: ["Revenue Acceleration", "Search Visibility", "Conversion Optimization", "Customer Automation"] },
  { c: "c2", h: "CAPABILITIES", items: ["Web Architecture", "Brand Systems", "Growth Marketing", "E-commerce Infrastructure"] },
  { c: "c3", h: "RESOURCES", items: ["Case Studies", "Growth Insights", "Playbooks", "Industry Reports"] },
];

const MARK = [
  "M 45.13 1.28 L 54.87 1.28 L 54.87 42.42 L 45.13 38.09 Z",
  "M 79.47 12.10 L 87.90 20.53 L 58.80 49.62 L 53.45 38.13 Z",
  "M 98.72 45.13 L 98.72 54.87 L 57.58 54.87 L 61.91 45.13 Z",
  "M 87.90 79.47 L 79.47 87.90 L 50.38 58.80 L 61.87 53.45 Z",
  "M 54.87 98.72 L 45.13 98.72 L 45.13 57.58 L 54.87 61.91 Z",
  "M 20.53 87.90 L 12.10 79.47 L 41.20 50.38 L 46.55 61.87 Z",
  "M 1.28 54.87 L 1.28 45.13 L 42.42 45.13 L 38.09 54.87 Z",
  "M 12.10 20.53 L 20.53 12.10 L 49.62 41.20 L 38.13 46.55 Z",
];

function useEntrance(root: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const html = document.documentElement;
    const el = root.current;
    if (!el || !html.classList.contains("js-enter") || el.dataset["entered"]) return;
    el.dataset["entered"] = "1";
    const EXPO = "cubic-bezier(.16,1,.3,1)";
    const SOFT = "cubic-bezier(.22,.65,.28,1)";
    const SETTLE = "cubic-bezier(.33,1,.68,1)";
    const small = matchMedia("(max-width: 648px)").matches;
    const d = small ? 0.62 : 1;
    const t = small ? 0.85 : 1;
    const anims: Animation[] = [];
    const run = (n: Element | null, frames: Keyframe[], dur: number, delay: number, easing: string) => {
      if (!n) return;
      anims.push(n.animate(frames, { duration: dur, delay: delay * t, easing, fill: "both" }));
    };
    const rise = (n: Element | null, y: number, dur: number, delay: number, e = SOFT) =>
      run(n, [{ opacity: 0, transform: `translate3d(0,${y * d}px,0)` }, { opacity: 1, transform: "none" }], dur, delay, e);
    const q = (s: string) => el.querySelector(s);
    rise(q(".eyebrow"), 12, 560, 60);
    run(q(".headline"), [{ transform: `translate3d(0,${118 * d}%,0)` }, { transform: "translate3d(0,0,0)" }], 950, 170, EXPO);
    rise(q(".lede"), 14, 660, 430);
    run(q(".cta"), [{ opacity: 0, transform: `translate3d(0,${12 * d}px,0) scale(.985)` }, { opacity: 1, transform: "none" }], 580, 620, SETTLE);
    rise(q(".mark"), 10, 540, 600);
    rise(q(".wordmark"), 10, 540, 600);
    rise(q(".tagline"), 10, 540, 670);
    el.querySelectorAll(".col").forEach((c, i) => rise(c, 14, 580, 720 + i * 70));
    run(q(".rule"), [{ transform: "scaleX(0)", transformOrigin: "left center" }, { transform: "scaleX(1)", transformOrigin: "left center" }], 720, 980, EXPO);
    rise(q(".legal"), 8, 500, 1120);
    el.querySelectorAll(".socials a").forEach((a, i) => rise(a, 8, 500, 1170 + i * 60));
    Promise.all(anims.map((a) => a.finished))
      .catch(() => {})
      .then(() => {
        html.classList.remove("js-enter");
        anims.forEach((a) => a.cancel());
      });
  }, [root]);
}

function Index() {
  const ref = useRef<HTMLDivElement>(null);
  useEntrance(ref);
  return (
    <div className="nx-root" ref={ref}>
      <div className="viewport">
        <div className="bg">
          <video
            autoPlay
            muted
            loop
            playsInline
            poster={POSTER}
            src={VIDEO}
            aria-label="Painted alpine panorama: a lone hiker with a pink backpack faces a snow-capped peak above a sea of clouds"
          />
        </div>
        <div className="scrim" />
        <div className="stage">
          <p className="abs eyebrow">Ready when you are</p>
          <div className="abs headline-mask">
            <h1 className="headline">Build your future now</h1>
          </div>
          <p className="abs lede">
            From branding and websites to marketing and growth systems, everything you need to move forward starts right here.
          </p>
          <a className="abs cta" href="#">
            <span>Take Control</span>
          </a>
        </div>
        <footer className="footer">
          <div className="finner">
            <div className="brandrow">
              <svg className="abs mark" viewBox="0 0 100 100" aria-hidden="true">
                {MARK.map((p) => (
                  <path key={p} d={p} fill="#fff" />
                ))}
              </svg>
              <span className="abs wordmark">Nexeus</span>
            </div>
            <p className="abs tagline">
              Change your future today using marketing and growth systems everything you need starts here.
            </p>
            <nav className="nav">
              {COLS.map((col) => (
                <div key={col.c} className={`abs col ${col.c}`}>
                  <h3>{col.h}</h3>
                  <ul>
                    {col.items.map((i) => (
                      <li key={i}>
                        <a href="#">{i}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="abs rule" />
            <div className="footrow">
              <p className="abs legal">® 2025 Nexeus all rights reserved.</p>
              <div className="abs socials">
                <a href="#" aria-label="LinkedIn">
                  <svg viewBox="0 0 30 30">
                    <path d="M26.8 0H3.2A3.2 3.2 0 0 0 0 3.2v23.6A3.2 3.2 0 0 0 3.2 30h23.6a3.2 3.2 0 0 0 3.2-3.2V3.2A3.2 3.2 0 0 0 26.8 0ZM9.2 25.6H4.8V11.3h4.4v14.3ZM7 9.4a2.6 2.6 0 1 1 0-5.1 2.6 2.6 0 0 1 0 5.1Zm18.6 16.2h-4.4v-7c0-1.7 0-3.8-2.3-3.8s-2.7 1.8-2.7 3.7v7.1h-4.4V11.3H16v2h.1a4.6 4.6 0 0 1 4.2-2.3c4.5 0 5.3 3 5.3 6.8v7.8Z" />
                  </svg>
                </a>
                <a href="#" aria-label="GitHub">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.4-.5-1.6.2-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1 .9 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
                  </svg>
                </a>
                <a href="#" aria-label="Medium">
                  <svg viewBox="0 0 1043.63 592.71">
                    <path d="M588.67 296.36c0 163.67-131.78 296.35-294.33 296.35S0 460 0 296.36 131.78 0 294.34 0s294.33 132.69 294.33 296.36M911.56 296.36c0 154.06-65.89 279-147.17 279s-147.17-124.94-147.17-279 65.88-279 147.16-279 147.17 124.9 147.17 279M1043.63 296.36c0 138-23.17 249.94-51.76 249.94s-51.75-111.91-51.75-249.94 23.17-249.94 51.75-249.94 51.76 111.9 51.76 249.94" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </footer>
      </div>
      <FloatingMenu />
    </div>
  );
}
