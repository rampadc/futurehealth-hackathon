# Walkthrough and explanatory writing

The user-approved style for this guide is **plain-language explanatory prose built around a worked example**. Apply it to future walkthrough and explanatory-document edits in this directory.

- Write connected paragraphs that follow a concrete scenario from beginning to end. Explain the supplied fact, the decision it changes, and the resulting action or output together.
- Use descriptive headings naming the subject, such as “Workshop space and worker readiness”. Avoid slogans, rhetorical questions, numbered fragments, and vague headings such as “The number starts a human response”.
- Introduce the people and their responsibilities before discussing system behavior. Use familiar words; explain an unavoidable technical term where it first appears.
- For each solver or tool, state the problem it answers, who calls it, when and why they call it, the supplied inputs, the returned outputs, and the human or application decision that uses those outputs. Distinguish rule checking from searching for a schedule. Never imply the stateless API monitors events or executes actions automatically.
- Put each scenario variation beside the decision it changes. Show the changed inputs, why the answer changes, and the actual returned result in the same place. Do not require a jump to a separate inspector to understand the example.
- Explain numbers with units and arithmetic. Distinguish elapsed minutes, minutes per person, and worker-minutes. Show that schedules come from `crew_rest.intervals`, not from aggregate totals.
- Use captured requests and responses for evidence; preserve exact JSON names and values. Put complete contracts and advanced controls after the explanation, with optional local JSON details where useful.
- Distinguish recorded events, fictional assumptions, and calculated projections. Do not claim authentication, diagnosis, operational execution, or benefits the demo does not establish.
- Keep the presentation black text on white. Use tables for genuinely parallel comparisons or schedules, not a grid of disconnected cards in place of an article.

A reusable instruction is: “Write this as a plain-language worked example in explanatory prose. Use descriptive headings and connected paragraphs. Follow the inputs, decision, reason and output in order, and explain each variation beside the step it changes. Keep technical details available without making them necessary to follow the story.”
