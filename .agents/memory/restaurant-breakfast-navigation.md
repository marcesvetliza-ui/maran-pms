---
name: Restaurant breakfast navigation
description: Agreed placement and reuse strategy for the next-day breakfast list.
---

Keep the existing next-day breakfast card on the Dashboard. Reuse the same query, list, totals, and print behavior from one shared component in Restaurant, exposed through a “Desayunos de mañana” button and dialog near the daily-reservations action. Do not add it as another main Restaurant tab unless breakfast later gains substantial operational workflows of its own.

**Why:** The Restaurant tab bar already contains five primary operational areas. Breakfast is currently a reservation-derived operational list, so another tab would overcrowd the hierarchy, especially on smaller screens.

**How to apply:** When implementing the sidebar cleanup, extract the breakfast UI into one shared component, preserve its Dashboard behavior, and verify server-side access to the breakfast endpoint for the Restaurant role.