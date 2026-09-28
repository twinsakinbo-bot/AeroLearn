import { cn } from "@/lib/utils"

/**
 * Jet — AeroLearn's mascot.
 *
 * A paper plane, and deliberately not an owl or any other animal: the product
 * is called AeroLearn, the mark is a plane and the tagline is "Your Path to
 * Academic Altitude", so the mascot is the thing the student is flying. It also
 * keeps us well clear of the obvious comparison.
 *
 * Pure SVG, no hooks, so it renders on the server and ships no JavaScript.
 * Colours are fixed ramp values rather than adaptive tokens — Jet is an
 * illustration and should look identical in both themes, per the "adaptive for
 * chrome, fixed ramp for decoration" rule in tailwind.config.js. Navy wings
 * with one orange crease is the logo restated at 80px.
 *
 * Geometry: the silhouette is the concave quad A→B→C→D, split along the fold
 * A→C into a lit upper wing and a shaded lower wing. The face sits on the wide
 * left half of the upper wing, which is the only part of a swept dart with
 * enough room for two eyes and a mouth.
 */
export type MascotMood = "idle" | "happy" | "cheer" | "think" | "sad" | "sleep"

interface MascotProps {
  mood?: MascotMood
  size?: "sm" | "md" | "lg" | "xl"
  /** Accessible name. Omit it and Jet is decorative (aria-hidden). */
  label?: string
  className?: string
}

const PX = { sm: 48, md: 80, lg: 120, xl: 176 } as const

/** One entry per mood — Tailwind cannot compile an interpolated class name. */
const MOTION: Record<MascotMood, string> = {
  idle: "animate-bounce-soft",
  happy: "animate-bounce-soft",
  cheer: "animate-tada",
  think: "animate-float",
  sad: "",
  sleep: "animate-float",
}

const WING_LIT = "#5D85E4"
const WING_SHADE = "#2445AE"
const OUTLINE = "#16295C"
const FOLD = "#FF7A3D"
const PUPIL = "#0C1839"
const BLUSH = "#FF9BB0"
const SPARK = "#FFC61E"

export function Mascot({ mood = "idle", size = "md", label, className }: MascotProps) {
  const px = PX[size]
  const blushing = mood === "happy" || mood === "cheer"

  return (
    <svg
      viewBox="0 0 120 120"
      width={px}
      height={px}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", MOTION[mood], className)}
    >
      {/* Lower wing, in shade. Drawn first so the lit wing overlaps its fold. */}
      <path
        d="M114 56 L40 72 L22 108 Z"
        fill={WING_SHADE}
        stroke={WING_SHADE}
        strokeWidth={7}
        strokeLinejoin="round"
      />

      {/* Lit upper wing — this is the surface the face lives on. */}
      <path
        d="M114 56 L12 12 L40 72 Z"
        fill={WING_LIT}
        stroke={WING_LIT}
        strokeWidth={7}
        strokeLinejoin="round"
      />

      {/* Secondary crease, in the brand orange. Sells "folded paper" more
          cheaply than shading, and it is the one warm mark on a navy plane —
          which is the whole logo in miniature. */}
      <path d="M15 15 L38 69" stroke={FOLD} strokeWidth={3} strokeOpacity={0.95}
            strokeLinecap="round" fill="none" />

      {/* Silhouette. Concave at C, which is what makes it read as a dart. */}
      <path
        d="M114 56 L12 12 L40 72 L22 108 Z"
        fill="none"
        stroke={OUTLINE}
        strokeWidth={4}
        strokeLinejoin="round"
      />

      {blushing && (
        <>
          <ellipse cx={44} cy={60} rx={7} ry={4.5} fill={BLUSH} opacity={0.6} />
          <ellipse cx={88} cy={56} rx={4.5} ry={3} fill={BLUSH} opacity={0.6} />
        </>
      )}

      {/* Eyes. `cheer` and `sleep` are closed, so they draw lids, not whites.
          Every coordinate here was picked to sit inside the upper wing — an eye
          that overhangs the silhouette reads as a bug, not as a style. */}
      {mood === "cheer" ? (
        <g fill="none" stroke={PUPIL} strokeWidth={4} strokeLinecap="round">
          <path d="M48 45 Q56 36 64 45" />
          <path d="M70 50 Q76 44 82 50" />
        </g>
      ) : mood === "sleep" ? (
        <g fill="none" stroke={PUPIL} strokeWidth={4} strokeLinecap="round">
          <path d="M48 43 Q56 50 64 43" />
          <path d="M70 48 Q76 53 82 48" />
        </g>
      ) : (
        <>
          <ellipse cx={56} cy={44} rx={9} ry={9.5} fill="#FFFFFF" />
          <ellipse cx={76} cy={50} rx={6} ry={6.5} fill="#FFFFFF" />
          {mood === "think" ? (
            /* Looking up and away, which is the whole point of the mood. */
            <>
              <circle cx={54} cy={41} r={4.2} fill={PUPIL} />
              <circle cx={74.5} cy={47} r={3} fill={PUPIL} />
            </>
          ) : mood === "sad" ? (
            <>
              <circle cx={57} cy={47} r={4} fill={PUPIL} />
              <circle cx={77} cy={52.5} r={2.8} fill={PUPIL} />
            </>
          ) : (
            <>
              <circle cx={58} cy={45} r={4.2} fill={PUPIL} />
              <circle cx={77.5} cy={51} r={3} fill={PUPIL} />
            </>
          )}
        </>
      )}

      {/* Brows. Only the two moods that need them draw them. */}
      {mood === "sad" && (
        <g fill="none" stroke={OUTLINE} strokeWidth={3} strokeLinecap="round">
          <path d="M46 33 Q56 30 65 34" />
          <path d="M70 41 Q76 39 82 42" />
        </g>
      )}
      {mood === "think" && (
        <path d="M47 31 Q56 27 65 31" fill="none" stroke={OUTLINE} strokeWidth={3}
              strokeLinecap="round" />
      )}

      {/* Mouth */}
      {mood === "cheer" ? (
        <path d="M54 57 Q66 76 79 58 Q66 63 54 57 Z" fill={PUPIL} />
      ) : (
        <path
          d={
            mood === "happy"
              ? "M53 58 Q65 71 78 59"
              : mood === "sad"
                ? "M56 65 Q66 57 76 63"
                : mood === "think"
                  ? "M58 63 L73 61"
                  : mood === "sleep"
                    ? "M63 61 Q67 66 71 61"
                    : "M56 60 Q65 66 74 60"
          }
          fill="none"
          stroke={PUPIL}
          strokeWidth={3.5}
          strokeLinecap="round"
        />
      )}

      {/* Celebration sparks, placed outside the silhouette so they read as
          motion rather than as marks on the paper. */}
      {mood === "cheer" && (
        <g fill={SPARK}>
          <path d="M100 20 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 Z" />
          <path d="M14 88 l2.2 5 5 2.2 -5 2.2 -2.2 5 -2.2 -5 -5 -2.2 5 -2.2 Z" />
          <path d="M104 88 l1.8 4 4 1.8 -4 1.8 -1.8 4 -1.8 -4 -4 -1.8 4 -1.8 Z" />
        </g>
      )}

      {/* Sleep Zs. */}
      {mood === "sleep" && (
        <g fill="none" stroke={SPARK} strokeWidth={3} strokeLinecap="round"
           strokeLinejoin="round">
          <path d="M92 26 h9 l-9 10 h9" />
          <path d="M105 8 h6 l-6 7 h6" />
        </g>
      )}
    </svg>
  )
}
