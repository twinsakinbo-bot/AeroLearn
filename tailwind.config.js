/** @type {import('tailwindcss').Config} */

// ─────────────────────────────────────────────────────────────────────────────
// AeroLearn design tokens — "Jetstream"
//
// Taken from the logo, not invented. public/logo-light.jpg is a deep navy "A"
// with an orange arrow, "Aero" in navy and "Learn" in orange, so navy + orange
// is the brand whether or not the CSS agrees. An earlier pass ran the whole
// product in violet; it looked deliberate and was still wrong, because nothing
// on screen matched the mark at the top of the page. This version keeps the
// structure and every class name, and changes what the names resolve to:
//
//   • Navy is the identity and the primary action. White on brand-600 is 8.3:1,
//     which is unusually strong for a filled button — a lot of gamified
//     learning UI puts white on a bright fill at ~2:1, charming and unreadable.
//   • Orange is the accent: the "Learn" half of the wordmark, highlights, the
//     energy. Loud enough that navy never turns into corporate blue.
//   • Mint, gold, flame and rose carry meaning — correct, XP, streak, wrong.
//   • Gem is aqua, not magenta. Navy/orange/aqua is a triad; magenta was just
//     the violet coming back in through a side door.
//   • Radii are bigger and shadows are *hard*: the chunky 4px bottom edge that
//     makes a button feel like a physical key you press down. See `.btn-*` in
//     globals.css, which is where the press animation lives.
//
// Two kinds of colour, unchanged from before:
//
//   1. Adaptive tokens (background, surface, foreground, muted, hairline, and
//      the DEFAULT of brand/accent/primary/streak/xp) resolve through CSS
//      variables set in app/globals.css. They flip with the `dark` class, so
//      `text-muted` is correct in both themes without a `dark:` at the call
//      site.
//   2. Fixed ramps (brand-50…950, accent, ink, success, warn, danger, flame,
//      gold, gem) are literal hex. Reach for these when a shade must not move —
//      the underside of a 3D button, a chart series, an illustration fill.
//
// Rule of thumb: adaptive for chrome and copy, fixed ramp for decoration.
// ─────────────────────────────────────────────────────────────────────────────

const adaptive = (name) => `rgb(var(${name}) / <alpha-value>)`

/** Shadow colour comes from --shadow-tint so dark mode drops to plain black. */
const tint = (alpha) => `rgb(var(--shadow-tint) / ${alpha})`

module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Adaptive surface + text ─────────────────────────────────────────
        background: adaptive("--color-bg"),
        foreground: adaptive("--color-fg"),

        surface: {
          DEFAULT: adaptive("--color-surface"),
          hover: adaptive("--color-surface-hover"),
          sunken: adaptive("--color-surface-sunken"),
          raised: adaptive("--color-surface-raised"),
        },

        /** Secondary copy. Meets AA on `background` in both themes. */
        muted: adaptive("--color-muted"),
        /** Tertiary copy — captions and large text only, not body. */
        subtle: adaptive("--color-subtle"),
        /** Default border. Now 2px at most call sites, so it carries weight. */
        hairline: adaptive("--color-hairline"),
        /** Focus ring. */
        ring: adaptive("--color-ring"),

        // ── Brand — navy, straight off the logo. Identity + primary action ──
        // 700 (#1B3C8C) is the exact navy of the wordmark. 600 is the button
        // fill: white on it is 8.3:1. 800/900 are the undersides of the 3D
        // buttons, which is why the ramp keeps going past "dark enough".
        brand: {
          DEFAULT: adaptive("--color-brand"),
          50:  "#EFF4FE",
          100: "#DCE7FC",
          200: "#BCCFF8",
          300: "#8FADF0",
          400: "#5D85E4",
          500: "#3760CE",
          600: "#2445AE",
          700: "#1B3C8C",
          800: "#182F6F",
          900: "#16295C",
          950: "#0C1839",
        },

        // ── Accent — the orange from the logo's arrow and "Learn" ────────────
        // 500 (#F2621E) is the mark's orange. As *text* on white it is only
        // 4.3:1, so the adaptive --color-accent points at 700 instead; use 500
        // for fills and 700 when the orange has to be readable.
        accent: {
          DEFAULT: adaptive("--color-accent"),
          50:  "#FFF4EE",
          100: "#FFE5D8",
          200: "#FFC8AC",
          300: "#FFA176",
          400: "#FF7A3D",
          500: "#F2621E",
          600: "#D64A0B",
          700: "#AE3A0C",
          800: "#8C3110",
          900: "#732B11",
          950: "#3F1206",
        },

        // ── Primary — legacy alias kept because ~500 call sites say it ───────
        // It now resolves to the navy action ramp rather than the old teal.
        // `primary-dark` is the pressed/hover shade, not a dark-mode value.
        primary: {
          DEFAULT: adaptive("--color-primary"),
          dark: "#182F6F",
          50:  "#EFF4FE",
          100: "#DCE7FC",
          200: "#BCCFF8",
          300: "#8FADF0",
          400: "#5D85E4",
          500: "#3760CE",
          600: "#2445AE",
          700: "#1B3C8C",
          800: "#182F6F",
          900: "#16295C",
          950: "#0C1839",
        },

        // ── Ink — neutrals, cooled toward navy so greys sit in the family ────
        ink: {
          50:  "#F6F8FC",
          100: "#EDF1F8",
          200: "#DBE2EF",
          300: "#BFC9DE",
          400: "#96A0BC",
          500: "#7C88A8",
          600: "#5B6786",
          700: "#48536E",
          800: "#333C52",
          900: "#212839",
          950: "#111726",
        },

        // ── Success — mint. "Correct." 600 takes white at 4.9:1 ─────────────
        success: {
          DEFAULT: adaptive("--color-success"),
          50:  "#E9FCF3",
          100: "#CFF8E3",
          200: "#A2F0CB",
          300: "#66E2AC",
          400: "#2ECC8B",
          500: "#12B375",
          600: "#069063",
          700: "#067352",
          800: "#085B43",
          900: "#084B39",
        },

        // ── Warn — gold. Caution, "almost", pending review ───────────────────
        warn: {
          DEFAULT: adaptive("--color-warn"),
          50:  "#FFF9E6",
          100: "#FFF0BF",
          200: "#FFE187",
          300: "#FFCC3D",
          400: "#FBB90F",
          500: "#E29C00",
          600: "#BC7503",
          700: "#965408",
          800: "#7B420D",
          900: "#683710",
        },

        // ── Danger — hot rose. "Wrong", and destructive actions ──────────────
        danger: {
          DEFAULT: adaptive("--color-danger"),
          50:  "#FFF0F3",
          100: "#FFE0E7",
          200: "#FFC6D3",
          300: "#FF9BB0",
          400: "#FF5F82",
          500: "#F82F5D",
          600: "#E01048",
          700: "#BC093E",
          800: "#9D0B3A",
          900: "#860D36",
        },

        // ── Flame — the streak. Only ever used for the streak counter ────────
        flame: {
          50:  "#FFF4ED",
          100: "#FFE5D4",
          200: "#FFC7A8",
          300: "#FFA070",
          400: "#FF6F3C",
          500: "#FF4D14",
          600: "#F03204",
          700: "#C72206",
          800: "#9E1D0D",
          900: "#7F1B0E",
        },

        // ── Gold — XP. A metal, deliberately warmer than `warn` ──────────────
        gold: {
          50:  "#FFFCE8",
          100: "#FFF7C2",
          200: "#FFEC85",
          300: "#FFDC47",
          400: "#FFC61E",
          500: "#F2A90A",
          600: "#C97F04",
          700: "#A05C08",
          800: "#84480D",
          900: "#6F3B11",
        },

        // ── Gem — the spendable currency. Aqua: it reads as a cut stone, it ──
        // cannot be mistaken for XP gold or streak orange, and navy/orange/aqua
        // closes a triad. 700 is the fill, because white on 600 is 4.1:1.
        gem: {
          50:  "#EAFBFF",
          100: "#CFF5FE",
          200: "#A0EAFC",
          300: "#63D9F6",
          400: "#18C8E8",
          500: "#04A9CC",
          600: "#0288A8",
          700: "#076B87",
          800: "#0C566D",
          900: "#10475A",
        },

        // ── Gamification tokens ──────────────────────────────────────────────
        // Adaptive DEFAULTs so `text-streak` / `text-xp` are legible on both
        // themes; numbered shades for fills and 3D undersides.
        streak: {
          DEFAULT: adaptive("--color-streak"),
          300: "#FFA070",
          400: "#FF6F3C",
          500: "#FF4D14",
          600: "#F03204",
          700: "#C72206",
        },
        xp: {
          DEFAULT: adaptive("--color-xp"),
          300: "#FFDC47",
          400: "#FFC61E",
          500: "#F2A90A",
          600: "#C97F04",
          700: "#A05C08",
        },
        coin: {
          DEFAULT: adaptive("--color-gem"),
          300: "#63D9F6",
          400: "#18C8E8",
          500: "#04A9CC",
          600: "#0288A8",
          700: "#076B87",
        },

        // ── Fixed dark-theme literals, for the rare spot that needs the ──────
        // dark surface while the page is still in light mode.
        dark: {
          bg:      "#0B1220",
          surface: "#121A2E",
          raised:  "#1B2540",
          muted:   "#9DA9C6",
          text:    "#EEF2FB",
          accent:  "#FFA176",
          success: "#66E2AC",
          warn:    "#FFCC3D",
          danger:  "#FF9BB0",
        },
      },

      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "ui-rounded", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },

      /**
       * One type scale for the whole product. Weight is baked into each
       * heading token, so a heading cannot accidentally ship at 600 and read
       * as body copy. Headings are 800 — this palette needs the mass.
       */
      fontSize: {
        "display-2xl": ["4.5rem",  { lineHeight: "1.02", letterSpacing: "-0.035em", fontWeight: "800" }],
        "display-xl":  ["3.75rem", { lineHeight: "1.04", letterSpacing: "-0.032em", fontWeight: "800" }],
        "display-lg":  ["3rem",    { lineHeight: "1.06", letterSpacing: "-0.030em", fontWeight: "800" }],
        "display":     ["2.5rem",  { lineHeight: "1.10", letterSpacing: "-0.028em", fontWeight: "800" }],
        h1:            ["2.125rem", { lineHeight: "1.14", letterSpacing: "-0.024em", fontWeight: "800" }],
        h2:            ["1.75rem",  { lineHeight: "1.20", letterSpacing: "-0.020em", fontWeight: "800" }],
        h3:            ["1.375rem", { lineHeight: "1.28", letterSpacing: "-0.016em", fontWeight: "700" }],
        h4:            ["1.125rem", { lineHeight: "1.36", letterSpacing: "-0.012em", fontWeight: "700" }],

        "body-lg":     ["1.125rem",  { lineHeight: "1.70" }],
        "body":        ["1rem",      { lineHeight: "1.65" }],
        "body-sm":     ["0.9375rem", { lineHeight: "1.60" }],
        "caption":     ["0.8125rem", { lineHeight: "1.50" }],
        /** Eyebrows and pill labels. Tracked wide because it is always caps. */
        "overline":    ["0.6875rem", { lineHeight: "1.40", letterSpacing: "0.10em", fontWeight: "800" }],
        /** Big numerals — streak count, XP total, score. Tabular. */
        "numeral":     ["1.625rem",  { lineHeight: "1.05", letterSpacing: "-0.02em", fontWeight: "800" }],
      },

      fontWeight: {
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "700",
        extrabold: "800",
        black: "900",
      },

      /**
       * Everything is rounder than before. This is the single change that most
       * moves the product away from "enterprise dashboard" — a 6px radius
       * reads as a form field, a 20px radius reads as a toy you can press.
       */
      borderRadius: {
        xs: "0.5rem",     /*  8px — chips, tiny pills            */
        sm: "0.625rem",   /* 10px — inputs, small buttons        */
        md: "0.75rem",    /* 12px — buttons                      */
        lg: "1rem",       /* 16px — large buttons, list rows     */
        xl: "1.25rem",    /* 20px — cards                        */
        "2xl": "1.625rem",/* 26px — feature panels               */
        "3xl": "2.125rem",/* 34px — hero art, mascot frames      */
        "4xl": "2.75rem", /* 44px — decorative blobs             */
      },

      borderWidth: {
        DEFAULT: "1px",
        /** The workhorse. Cards and buttons carry a visible edge now. */
        2: "2px",
        3: "3px",
        4: "4px",
      },

      spacing: {
        section: "5.5rem",
        "section-lg": "8rem",
        /** Height of the 3D press travel. Shared by shadow + translate. */
        press: "4px",
      },

      maxWidth: {
        prose: "68ch",
        content: "72rem",
      },

      backdropBlur: {
        xs: "2px",
      },

      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        /** Overshoots. For anything that should feel rewarding. */
        spring: "cubic-bezier(0.22, 1.20, 0.36, 1)",
        pop: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },

      /**
       * Two families, and they do different jobs.
       *
       * The soft ramp (xs…2xl) is ordinary elevation, tinted violet in light
       * mode and plain black in dark via `--shadow-tint`, because a coloured
       * shadow on a near-black page just looks like fog.
       *
       * The `pop-*` family is the hard 4px bottom edge that makes a button
       * feel like a physical key. It is a *solid* offset with no blur, using a
       * darker shade of the button's own fill. Pressing removes it and
       * translates the button down 4px, so the key travels. That animation
       * lives in `.btn` in globals.css.
       */
      boxShadow: {
        xs: `0 1px 2px ${tint(0.06)}`,
        sm: `0 2px 4px ${tint(0.07)}, 0 1px 2px ${tint(0.05)}`,
        DEFAULT: `0 3px 8px ${tint(0.08)}, 0 1px 3px ${tint(0.05)}`,
        md: `0 6px 14px ${tint(0.09)}, 0 2px 5px ${tint(0.06)}`,
        lg: `0 14px 30px ${tint(0.12)}, 0 5px 10px ${tint(0.07)}`,
        xl: `0 24px 48px ${tint(0.14)}, 0 10px 18px ${tint(0.08)}`,
        "2xl": `0 36px 72px ${tint(0.18)}`,
        inner: `inset 0 2px 4px ${tint(0.07)}`,
        none: "none",

        /* ── Hard 4px key edges ──────────────────────────────────────────── */
        "pop-brand":   "0 4px 0 0 #16295C",
        "pop-accent":  "0 4px 0 0 #8C3110",
        "pop-success": "0 4px 0 0 #067352",
        "pop-danger":  "0 4px 0 0 #BC093E",
        "pop-gold":    "0 4px 0 0 #C97F04",
        "pop-flame":   "0 4px 0 0 #C72206",
        "pop-gem":     "0 4px 0 0 #0C566D",
        "pop-ink":     "0 4px 0 0 #111726",
        /** For light surfaces — the edge is the hairline, so it adapts. */
        "pop-surface": "0 4px 0 0 rgb(var(--color-hairline))",
        /** Shallower variant for small buttons and chips. */
        "pop-2":       "0 2px 0 0 rgb(var(--color-hairline))",

        /* ── Focus / celebration glows ────────────────────────────────────── */
        "glow-brand":   "0 0 0 4px rgb( 36  69 174 / 0.22)",
        "glow-accent":  "0 0 0 4px rgb(242  98  30 / 0.24)",
        "glow-success": "0 0 0 4px rgb(18 179 117 / 0.22)",
        "glow-danger":  "0 0 0 4px rgb(248 47 93 / 0.22)",
        "glow-gold":    "0 0 24px 0 rgb(255 198 30 / 0.45)",
      },

      animation: {
        /* Entrances — unchanged names, so existing call sites keep working. */
        "fade-in": "fade-in 0.4s ease-out both",
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-in-right": "slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1) both",
        "scale-in": "scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 1.6s linear infinite",

        /* New — the reward vocabulary. */
        /** Default entrance for anything earned: overshoots, then settles. */
        "pop-in": "pop-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        /** Mascot idle nudge and "try again" shake, depending on duration. */
        wiggle: "wiggle 0.6s ease-in-out",
        "bounce-soft": "bounce-soft 1.8s ease-in-out infinite",
        /** Correct answer. Scale + rotate, one shot. */
        tada: "tada 0.7s ease-out",
        /** A badge or streak day landing on the page. */
        stamp: "stamp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        /** The streak flame. Subtle — it must not become a strobe. */
        flicker: "flicker 2.8s ease-in-out infinite",
        /** Progress bar fill sheen after an increase. */
        sheen: "sheen 1.1s ease-out",

        /** Confetti burst on lesson complete. */
        "burst-up": "burst-up 1.1s cubic-bezier(0.16, 1, 0.3, 1) both",
        /** Node on the learning path unlocking. */
        unlock: "unlock 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both",
      },

      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(18px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.94)" },
          to: { opacity: "1", transform: "scale(1)" },
        },

        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(107 53 224 / 0.42)" },
          "50%": { boxShadow: "0 0 0 12px rgb(107 53 224 / 0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-9px)" },
        },
        /** Needs a background wider than the box — see `.skeleton`. */
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.82)" },
          "60%": { opacity: "1", transform: "scale(1.04)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },

        wiggle: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "20%": { transform: "rotate(-7deg)" },
          "40%": { transform: "rotate(6deg)" },
          "60%": { transform: "rotate(-4deg)" },
          "80%": { transform: "rotate(2deg)" },
        },
        "bounce-soft": {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "45%": { transform: "translateY(-6px) scale(1.02)" },
        },
        tada: {
          "0%": { transform: "scale(1) rotate(0deg)" },
          "25%": { transform: "scale(1.14) rotate(-5deg)" },
          "55%": { transform: "scale(1.08) rotate(4deg)" },
          "100%": { transform: "scale(1) rotate(0deg)" },
        },

        stamp: {
          "0%": { opacity: "0", transform: "scale(1.6) rotate(-8deg)" },
          "70%": { opacity: "1", transform: "scale(0.96) rotate(2deg)" },
          "100%": { opacity: "1", transform: "scale(1) rotate(0deg)" },
        },
        flicker: {
          "0%, 100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
          "35%": { transform: "scale(1.06) rotate(-2deg)", opacity: "0.94" },
          "70%": { transform: "scale(0.98) rotate(2deg)", opacity: "1" },
        },
        sheen: {
          from: { transform: "translateX(-110%)" },
          to: { transform: "translateX(210%)" },
        },
        "burst-up": {
          "0%": { opacity: "0", transform: "translateY(0) scale(0.6)" },
          "25%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translateY(-96px) scale(1)" },
        },
        unlock: {
          "0%": { transform: "scale(1)", filter: "saturate(0.2)" },
          "45%": { transform: "scale(1.16)", filter: "saturate(1.2)" },
          "100%": { transform: "scale(1)", filter: "saturate(1)" },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
}
