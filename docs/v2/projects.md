# Projects V2 — planning draft

Status: discussion draft. This document records product decisions made with the owner and open questions. It is not approved for implementation.

## Purpose and boundary

Projects is the owner's portfolio and case-study collection. An entry can stay private in Dashboard V2 or be published on the public website. It is not a client task tracker or a system for claiming that a client's business grew.

The existing project form and public project page are references, not V2 specifications. Public-site integration must respect the preservation contract in `foundation.md`; any visible layout change needs separate approval.

## Confirmed product decisions

- Each project has a type: **Demo**, **Personal**, or **Client**. The type is visible to visitors when the project is published, so a demo is not presented as client work.
- Work status and visibility are separate. A project may be **In progress** and published, or private regardless of its work status.
- Private projects remain visible to the owner in the dashboard and are not publicly accessible.
- The owner controls the order of published projects manually. The homepage uses the first projects in that same order; there is no separate featured ordering.
- Every published project has a public detail page, even when its optional case study is empty. The page shows the available summary, links, and images.
- A project may be published without a full case study, including while it is in progress. The full case study remains optional after completion.
- Publication requires a project name, type, and short summary in German, English, and Arabic. A cover image and case study are optional. Every published image requires alternative text in all three languages.
- A case study uses one flexible rich-text body per language, with optional editorial guidance or a starter outline. The owner can change or omit the suggested sections.
- The editor supports headings, emphasis, lists, links, images within the story, code blocks, and tables.
- Project images can appear within the case study and in a separate gallery. A cover image can be chosen separately.
- A client project may be published without displaying the client's name. If the client does not allow the project to be shown at all, the entry stays private.
- The owner decides which client details and links to publish. Website URL, source-code URL, and other relevant links are independent and optional. A private repository URL is never required or automatically exposed.
- Demonstrated business results may be described in the case study when available, but no growth metrics or outcome claims are required.
- Existing legacy projects will be recreated by the owner in V2 rather than imported automatically.

## Proposed authoring flow — not yet approved

1. Create a private draft and choose its type and work status.
2. Add the short public-facing facts and translated card content.
3. Optionally write the richer case study and add cover, inline images, and gallery images.
4. Preview the public page in each language.
5. Publish when the agreed minimum content is complete; publish and work status remain independent.
6. Change visibility, content, links, and manual display order later.

## Frontend direction agreed with the owner

- Replace the temporary Projects placeholder inside the existing Dashboard V2 shell. Keep its approved visual system, including its light/dark and surface choices.
- Use one editor page with clearly grouped sections rather than a step-by-step wizard. The page supports saving a private draft, previewing each language, and publishing when ready.
- Keep optional editorial guidance inside the rich-text case-study editor without constraining the owner's structure.
- Extend the existing public project page to render the approved rich-text content, inline images, and tables while preserving the public website's accepted visual identity. This is an approved content-layout extension, not a general public-site redesign.

## Pagination proposal — awaiting owner confirmation

- Preserve the public `/work` page's existing pattern: initially show six projects and reveal more in batches of six with the existing Load more control.
- Backend2 should return only the requested batch, in the owner's manual order, with a stable secondary order and an indication of whether more projects exist. It must not expose private projects.
- The dashboard list may show all projects without pagination controls for the initial version so manual ordering remains easy. Its list API can support bounded paging for future growth.

## Validation direction

- Follow the repository-wide form validation behavior in `AGENTS.md`: first submit, then revalidate on change; show accessible inline errors and focus the first invalid field.
- Saving a private draft permits incomplete translations and images. Publishing requires the approved minimum content in all three languages and translated alternative text for every image that will be public.
- The server independently enforces publication rules. A rejected publish attempt must leave the saved draft available and explain what needs attention.

## Specification sections still to complete

After the open product decisions are resolved: exact content fields, editor and image behavior, publication and preview rules, ordering behavior, private and public API contracts, permissions, data and migration rules, failure states, tests, and definition of done. Backend2 database, authentication, and API namespace decisions are prerequisites for implementation under `foundation.md`.
