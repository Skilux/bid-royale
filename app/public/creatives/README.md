# NeoRack ad creatives

Illustrative mock creatives: the ad each Supplier agent runs for NeoRack in its own channel. **No real campaign ran.** The UI and the video must not present these as real ad performance, real reach or real clicks. They are visuals only, and they carry no money amounts, so no `REAL` / `SIMULATED` / `PRE-RECORDED` badge applies to them.

All files are hand-written SVG, 360x640 (9:16). They scale down to a card thumbnail (checked at 120 px wide) and work full-screen in the video. No external fonts or images: text is SVG text on the system font stack.

| Supplier | Path (served at) | Channel format | Colour | Hook |
|---|---|---|---|---|
| TechBlog | `/creatives/techblog.svg` | blog inline banner | teal to mint gradient (`#0f2a3a`, `#1e5f74`, `#72c99a`) | H100s by the hour. No sales call. |
| CodePodcast | `/creatives/codepodcast.svg` | podcast cover, sponsored read card, waveform | purple stripes (`#4b2a6b`, `#7a3fa0`) | Your next training run starts tonight. |
| DevNewsletter | `/creatives/devnewsletter.svg` | newsletter sponsor block | cream `#f4efe4` + red `#c9362e` | Skip the waitlist. Ship today. |
| GamingForum | `/creatives/gamingforum.svg` | forum banner | magenta glow (`#ff3df0` to `#2a0a4a`) | Out of VRAM? Rent an H100. |

Files live in `app/public/creatives/`. Every creative has the NeoRack wordmark, the line "GPUs for builders", a "Sign up" button and a small "Sponsored · <channel>" label.

Use from the UI:

```jsx
<img src="/creatives/techblog.svg" alt="NeoRack ad on TechBlog" width={120} />
```

GamingForum loses the bid (rejected below the gate). Show it greyed with CSS, for example `filter: grayscale(1)`, or do not serve it. There is no separate greyed file.

Contact sheet for review: `docs/design/creatives/contact-sheet.html` (PNG render: `docs/design/creatives/contact-sheet.png`).
