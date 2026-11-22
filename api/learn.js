"use strict";

var redis = require("../lib/redis").command;

var MAX_EXAMPLES_PER_BATCH = 64;
var MAX_EXAMPLES_PER_HOUR = 50000;
var NOTE_COUNT = 88;
var CONTEXT_LENGTH = 4;

var INGEST_SCRIPT = [
  "local current = tonumber(redis.call('GET', KEYS[1]) or '0')",
  "local incoming = 0",
  "for index = 3, #ARGV, 2 do",
  "  incoming = incoming + tonumber(ARGV[index])",
  "end",
  "local maximum = tonumber(ARGV[1])",
  "if current + incoming > maximum then return -1 end",
  "local total = redis.call('INCRBY', KEYS[1], incoming)",
  "if current == 0 then redis.call('EXPIRE', KEYS[1], 7200) end",
  "for index = 2, #ARGV, 2 do",
  "  redis.call('HINCRBY', KEYS[2], ARGV[index], tonumber(ARGV[index + 1]))",
  "end",
  "return total"
].join("\n");

function isNote(note) {
  return Number.isInteger(note) && note >= 0 && note < NOTE_COUNT;
}

function parseExamples(body) {
  var examples = body && body.examples;
  if (!Array.isArray(examples) || examples.length === 0 ||
      examples.length > MAX_EXAMPLES_PER_BATCH) return null;

  var increments = Object.create(null);
  for (var index = 0; index < examples.length; index++) {
    var example = examples[index];
    if (!example || !Array.isArray(example.context) ||
        example.context.length > CONTEXT_LENGTH || !isNote(example.note) ||
        !example.context.every(isNote)) return null;

    var field = example.context.join(",") + "|" + example.note;
    increments[field] = (increments[field] || 0) + 1;
  }
  return { count: examples.length, increments: increments };
}

module.exports = async function (request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  var parsed = parseExamples(request.body);
  if (!parsed) return response.status(400).json({ error: "Invalid note examples." });

  var hour = Math.floor(Date.now() / 3600000);
  var args = [
    "EVAL", INGEST_SCRIPT, "2", "piano:ingest:" + hour, "piano:pending",
    String(MAX_EXAMPLES_PER_HOUR)
  ];
  Object.keys(parsed.increments).forEach(function (field) {
    args.push(field, String(parsed.increments[field]));
  });

  try {
    var accepted = await redis(args);
    if (accepted === -1) {
      return response.status(429).json({ error: "Hourly contribution limit reached." });
    }
    return response.status(202).json({ accepted: parsed.count });
  } catch (error) {
    console.error("Could not save shared piano examples:", error.message);
    return response.status(503).json({ error: "Shared learning is unavailable." });
  }
};
