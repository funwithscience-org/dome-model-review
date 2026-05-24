# External Reports Log

This directory permanently logs every external problem report received via GitHub Issues, regardless of whether the report leads to a change in the review.

## Schema

Each report is logged as `report-{issue-number}.json`:

```json
{
  "issue_number": 1,
  "issue_url": "https://github.com/funwithscience-org/dome-model-review/issues/1",
  "reported_at": "ISO timestamp",
  "reporter": "GitHub username",
  "reporter_type": "human|ai|author|expert|other",
  "category": "factual_error|citation|missing_argument|verdict_disagreement|structural|other",
  "win_id": "WIN-NNN or null",
  "section": "section reference or null",
  "description": "What the reporter says is wrong",
  "sources": ["supporting evidence links"],
  "status": "new|investigating|accepted|rejected|duplicate",
  "analyst_assessment": "Analyst's evaluation of the report",
  "decider_action": "What action was taken",
  "resolution": "How it was resolved (even if rejected)",
  "resolution_date": "ISO timestamp or null"
}
```

## Policy

- **Every report is logged permanently.** Even rejected reports stay in this directory.
- **Every report gets an analyst assessment.** The analyst evaluates the claim against primary sources.
- **Every report gets a decider action.** The decider either creates a patch, defers with rationale, or rejects with explanation.
- **Rejections include reasoning.** If we disagree with a report, we explain why — transparently, with evidence.
- **The GitHub issue is updated** with our assessment and resolution.
