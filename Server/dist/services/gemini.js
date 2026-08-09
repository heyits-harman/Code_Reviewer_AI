import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const SYSTEM_INSTRUCTION = `You are a senior code reviewer. You will be given a git diff (unified patch format) for one file, and optionally the full file content for extra context.

Review ONLY the lines that were added or changed in the diff (lines starting with "+"). Do not comment on unchanged context lines.

Look for:
- bugs: logic errors, null/undefined handling, off-by-one, unhandled edge cases
- security: hardcoded secrets, injection risks, unsafe eval, missing input validation
- style: naming, dead code, unused variables, convention violations
- performance: obvious inefficiencies, unnecessary loops/re-renders, blocking calls

Respond with ONLY a raw JSON array, no markdown fences, no preamble, no explanation text. Each element must match this exact shape:
{
  "line": <number, the line number in the NEW file version>,
  "severity": "critical" | "warning" | "suggestion",
  "category": "bug" | "security" | "style" | "performance",
  "comment": "<concise 1-2 sentence explanation>",
  "suggestion": "<optional short code fix, omit if not applicable>"
}

If there are no issues, respond with an empty array: []
Do not invent line numbers outside the diff's range. Do not comment on formatting the linter would catch (semicolons, quote style).`;
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: SYSTEM_INSTRUCTION,
});
function extractJson(rawText) {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
}
export async function reviewFile(file) {
    const prompt = [
        `FILE: ${file.fileName}`,
        `STATUS: ${file.status}`,
        `\nDIFF: \n${file.patch}`,
        file.fullContent
            ? `\n FULL FILE CONTENT (only for context, do not review unchanged lines): \n${file.fullContent.slice(0, 8000)}`
            : "",
    ].join("\n");
    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const parsed = extractJson(text);
        if (!Array.isArray(parsed))
            return [];
        return parsed
            .filter((item) => item && typeof item.line === "number")
            .map((item) => ({
            file: file.fileName,
            line: item.line,
            severity: item.severity ?? "suggestion",
            category: item.category ?? "style",
            comment: item.comment ?? "",
            suggestion: item.suggestion,
        }));
    }
    catch (err) {
        console.error(`Gemini review failed for ${file.fileName}:`, err);
        return [];
    }
}
export async function reviewAllFiles(files) {
    const BATCH_SIZE = 4;
    const result = [];
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const batch = files.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(reviewFile));
        result.push(...batchResults.flat());
    }
    return result;
}
//# sourceMappingURL=gemini.js.map