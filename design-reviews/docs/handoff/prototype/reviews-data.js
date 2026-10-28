// Seed data. Features (e.g. Workspaces, Billing) group screens. To add a screen: drop its two images in qa/<id>/ and add an entry below.
// Marker boxes are % of the production image: x, y, w, h.
window.REVIEWS = [
  {
    id: 'workspaces',
    feature: 'Workspaces',
    title: 'Overview · Trial',
    date: 'Oct 27, 2026',
    figma: 'https://www.figma.com/design/BJr7jJNHQmponeZCCbVb19/Build---Main-application?node-id=12705-106188&t=lJWaxOoQmdO7SaOQ-1',
    production: 'qa/workspaces/production.png',
    design: 'qa/workspaces/design.png',
    notes: [
      { title: 'Missing breadcrumb', body: 'Should read “Admin / Workspaces”.', box: { x: 19.6, y: 2.2, w: 6.6, h: 3 } },
      { title: 'Legend text colour', body: '“in use”, “assigned” and “unassigned” labels should be <code>#404040</code>, as in the design.', box: { x: 20.9, y: 30, w: 45.2, h: 2.5 } },
      { title: '“7,500 total” colour', body: 'Same as the legend: <code>#404040</code>.', box: { x: 90.8, y: 24.7, w: 5.5, h: 2.5 } },
      { title: '“You have 1 workspace · Unlimited on trial” colour', body: 'Too light. Should be <code>#404040</code>.', box: { x: 20.9, y: 38.2, w: 19.4, h: 2.6 } },
      { title: 'Search shown too early', body: 'Only show search with more than 10 workspaces. Magnifying glass should be <code>#a3a3a3</code>.', question: 'Reuse the search component from other screens, or roll this one out everywhere?', box: { x: 78.5, y: 45.5, w: 17, h: 4 } },
      { title: 'Workspace image column too big', body: 'Avatar and column should be smaller, as in the design.', box: { x: 20.1, y: 54.8, w: 3.1, h: 5.5 } }
    ]
  }
];
