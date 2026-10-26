import type { ModelConfig } from "@/config/models";

// Realistic mock responses keyed by task type
const MOCK_RESPONSES: Record<string, string[]> = {
  "Write a Python function": [
    '```python\ndef fibonacci(n: int) -> list[int]:\n    """Return the first n Fibonacci numbers."""\n    if n <= 0:\n        return []\n    if n == 1:\n        return [0]\n    seq = [0, 1]\n    for _ in range(2, n):\n        seq.append(seq[-1] + seq[-2])\n    return seq\n```\n\nThe function handles edge cases (n <= 0, n == 1) and uses a clean iterative approach.',
    'Here\'s a Python function to generate Fibonacci numbers:\n\n```python\ndef fibonacci(n):\n    a, b = 0, 1\n    result = []\n    for _ in range(n):\n        result.append(a)\n        a, b = b, a + b\n    return result\n```\n\nThis is efficient O(n) time with O(n) space.',
    '```python\ndef fibonacci(n: int):\n    if n <= 0: return []\n    fib = [0, 1]\n    while len(fib) < n:\n        fib.append(fib[-1] + fib[-2])\n    return fib[:n]\n```\n\nSimple and readable. For large n, consider using a generator to save memory.',
    '```python\nfrom functools import lru_cache\n\n@lru_cache(maxsize=None)\ndef _fib(n: int) -> int:\n    if n < 2: return n\n    return _fib(n-1) + _fib(n-2)\n\ndef fibonacci(n: int) -> list[int]:\n    return [_fib(i) for i in range(n)]\n```\n\nUses memoization for O(n) computation. The recursive pattern is elegant but the iterative version is more memory-efficient.',
  ],
  "Summarize text": [
    "The passage discusses the impact of climate change on global agriculture, highlighting three key areas: crop yield reduction in tropical regions, increased water scarcity affecting irrigation, and the need for drought-resistant crop varieties. The author argues for urgent policy intervention and increased research funding.",
    "Climate change threatens global food security through reduced crop yields, water shortages, and extreme weather. The article calls for investment in resilient agriculture and international cooperation on emissions reduction. Key stats: 15% yield decline projected by 2050 without intervention.",
    "This text examines how rising temperatures affect farming worldwide. Main points: tropical crops are most at risk, irrigation systems are strained, and adaptation requires both technological and policy solutions. The tone is urgent but solutions-focused.",
    "A comprehensive analysis of climate change's effects on agriculture. The author presents evidence of declining yields, discusses adaptation strategies like GMO crops and precision irrigation, and concludes that coordinated global action is essential. Statistical projections are cited from IPCC reports.",
  ],
  "Explain a bug": [
    "The bug is a classic off-by-one error in the loop condition. Using `i <= arr.length` causes an out-of-bounds access because array indices are 0-based. Fix by changing to `i < arr.length`.\n\nAdditionally, the function doesn't handle empty arrays, which would cause a division by zero when calculating the average.",
    "Root cause: off-by-one in loop bound `for (let i = 0; i <= items.length; i++)`. Array indices go from 0 to length-1, so `items[items.length]` is always undefined, causing NaN in the sum.\n\nFix: change `<=` to `<`. Also add a guard for empty input returning 0.",
    "Two issues: (1) off-by-one - `<=` should be `<`; (2) no empty-array check, so `sum / arr.length` divides by zero. Both are common in beginner code. The fix is straightforward and should be paired with a unit test.",
    'The problem is `for (i = 0; i <= arr.length; i++)` — this accesses `arr[arr.length]` which is undefined. When added to the sum, it produces NaN.\n\nSecondary issue: `return sum / arr.length` crashes on empty arrays. Add `if (arr.length === 0) return 0;` at the top.\n\nThese are defensive programming basics every developer should know.',
  ],
  "Extract JSON from text": [
    '```json\n{\n  "name": "John Doe",\n  "age": 34,\n  "email": "john@example.com",\n  "skills": ["Python", "React", "PostgreSQL"]\n}\n```\n\nExtracted from the resume text. All fields were explicitly stated.',
    '```json\n{\n  "name": "John Doe",\n  "age": 34,\n  "email": "john@example.com",\n  "skills": ["Python", "React", "PostgreSQL"],\n  "years_experience": 8,\n  "location": "San Francisco, CA"\n}\n```',
    '```json\n{"name":"John Doe","age":34,"email":"john@example.com","skills":["Python","React","PostgreSQL"]}\n```\n\nMinimal extraction of the key fields.',
    '```json\n{\n  "personal": {\n    "name": "John Doe",\n    "age": 34,\n    "email": "john@example.com",\n    "location": "San Francisco"\n  },\n  "professional": {\n    "skills": ["Python", "React", "PostgreSQL"],\n    "years": 8,\n    "title": "Senior Developer"\n  }\n}\n```\n\nStructured into personal and professional sections for clarity.',
  ],
};

const DEFAULT_RESPONSE = [
  "Here is my analysis of the task. I've considered multiple angles and arrived at a well-reasoned response that addresses the core requirements. The approach balances efficiency with clarity, making it suitable for production use.",
  "I'll approach this step by step. First, let's understand the requirements, then implement a solution that is both correct and maintainable. The key insight here is to focus on the data flow before optimizing for performance.",
  "Looking at this task, I see several important considerations. The most critical aspect is correctness, followed by readability. Here's my take, which should work well for most use cases while keeping the code clean and documented.",
  "This is an interesting problem. I recommend breaking it down into smaller components. The solution below prioritizes clarity over cleverness, which makes it easier to maintain and debug in the long run. Edge cases are handled explicitly.",
];

// Extra variability: add slight differences per model
const MODEL_FLAVORS: Record<string, string> = {
  "deepseek-chat": " (DeepSeek's analysis emphasizes practical, no-nonsense solutions.)",
  "deepseek-reasoner": " (DeepSeek R1 reasons step-by-step, showing its chain of thought.)",
  "qwen/qwen2.5-72b-instruct": " (Qwen provides well-structured, thorough responses.)",
  "qwen/qwq-32b": " (QWQ 32B excels at reasoning tasks with clear logical flow.)",
  "nvidia/llama-3.1-nemotron-70b-instruct": " (Nemotron delivers polished, production-ready output.)",
  "meta-llama/llama-3.3-70b-instruct": " (Llama 3.3 balances quality with efficiency.)",
  "google/gemini-2.0-flash-001": " (Gemini Flash is fast and concise, ideal for quick tasks.)",
  "anthropic/claude-3.5-haiku": " (Claude Haiku provides nuanced, well-reasoned analysis.)",
};

const MOCK_SCORES: Record<string, { correctness: number; clarity: number; completeness: number }> = {
  "deepseek-chat": { correctness: 8, clarity: 7, completeness: 8 },
  "deepseek-reasoner": { correctness: 9, clarity: 8, completeness: 9 },
  "qwen/qwen2.5-72b-instruct": { correctness: 8, clarity: 9, completeness: 8 },
  "qwen/qwq-32b": { correctness: 7, clarity: 7, completeness: 7 },
  "nvidia/llama-3.1-nemotron-70b-instruct": { correctness: 8, clarity: 8, completeness: 7 },
  "meta-llama/llama-3.3-70b-instruct": { correctness: 7, clarity: 8, completeness: 7 },
  "google/gemini-2.0-flash-001": { correctness: 6, clarity: 8, completeness: 6 },
  "anthropic/claude-3.5-haiku": { correctness: 8, clarity: 9, completeness: 8 },
};

export function getMockResponse(model: ModelConfig, prompt: string): string {
  // Match preset
  for (const [keyword, responses] of Object.entries(MOCK_RESPONSES)) {
    if (prompt.toLowerCase().includes(keyword.toLowerCase())) {
      const idx = Math.abs(hashStr(model.id + prompt)) % responses.length;
      return responses[idx] + (MODEL_FLAVORS[model.id] ?? "");
    }
  }

  const idx = Math.abs(hashStr(model.id + prompt)) % DEFAULT_RESPONSE.length;
  return DEFAULT_RESPONSE[idx] + (MODEL_FLAVORS[model.id] ?? "");
}

export function getMockScore(model: ModelConfig): { correctness: number; clarity: number; completeness: number } {
  return MOCK_SCORES[model.id] ?? { correctness: 7, clarity: 7, completeness: 7 };
}

export function getMockTokens(model: ModelConfig, prompt: string): { inputTokens: number; outputTokens: number } {
  // Realistic token estimates
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = 200 + Math.abs(hashStr(model.id + prompt)) % 400;
  return { inputTokens, outputTokens };
}

function hashStr(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}