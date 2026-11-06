# DECISIONS

Write in English. Short bullet points are fine. Reviewers read this file alongside your code.

## What I assumed

<!-- Anything the brief did not say that you had to decide. -->

- Readiness uses the current UTC date and the preceding six months as its required report range.

## What I found in the API or data

<!-- Anything that did not match the docs, or surprised you, and how you handled it. -->

- The Level 1 implementation read the full request and change feeds every time a report was generated.
- The Helpdesk client already respected `Retry-After`; preventing duplicate ingestion was the main additional protection against avoidable rate-limit responses.

## How I used AI

<!-- Which tools, what you asked, what came back wrong, what you changed. "I didn't use AI" is fine too. -->

- Used GitHub Copilot to assist with backend implementation, including API integration, business logic, and Level 2 caching.
- Used Antigravity to generate the entire frontend, consisting of HTML, CSS, and vanilla JavaScript, based on the application requirements.
- Reviewed and locally tested the backend implementation.

## Trade-offs and what I would do next

<!-- What you left out to stay within 3 hours, and what you would do with more time. -->

- The cache is process-local. Level 3 change synchronization was left out to stay within the time limit. With more time, I would implement incremental synchronization to detect and process new or updated records instead of relying on full data ingestion.
- No real API benchmark was possible without invitation credentials. A temporary local mock measurement used 5,000 in-memory request records (not 5,000 HTTP requests), but it was run inline and no benchmark script or persistent log was retained. Its timing numbers should therefore not be treated as verified measurements.