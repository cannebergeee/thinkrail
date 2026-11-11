# Third-party source attribution

## ZCode

Source: https://github.com/zai-org/ZCode
Revision: `3c5b227649371507ddc4eb46ac5133afe6db1cab` (v3.16.2 source snapshot).
License: Apache-2.0, reproduced in [third-party/ZCode-LICENSE.txt](third-party/ZCode-LICENSE.txt).

The standard palettes in `apps/web/src/themes/bundled/dark.theme.json` and
`light.theme.json` adapt the Zai Dark / Zai Light definitions in ZCode's
`packages/ui/src/styles.css`. Surface and primary colors are reused; translucent separators are
resolved onto opaque surfaces and foreground/feedback values are adjusted for ThinkRail's contrast
requirements. Terminal and syntax palettes remain ThinkRail's.

The user-bubble treatment in `apps/web/src/chat/turns.tsx` adapts the presentation of
`packages/ui/src/v4/ConversationUserInputBubble.tsx`, translated to ThinkRail's semantic tokens.
The shell, project navigation, task entry, composer and settings layout follow ZCode's `DESIGN.md`,
`DesktopWindowFrame.tsx`, `project-sidebar/ProjectSidebarNavigation.tsx` and conversation layouts.
These are local adaptations by ThinkRail contributors; ZCode's runtime, service code, assets and
trademarks are not bundled. ThinkRail is an independent project.

Upstream NOTICE.md states that first-party code is Apache-2.0 and third-party resources retain their
own licenses. No third-party resources from the ZCode repository are included in this adaptation.
