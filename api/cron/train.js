"use strict";

var crypto = require("crypto");
var redis = require("../../lib/redis").command;
var PianoModel = require("../../model/piano_model");

var PENDING_KEY = "piano:pending";
var PROCESSING_KEY = "piano:pending:processing";
var MODEL_KEY = "piano:global-model";
var LOCK_KEY = "piano:training-lock";
var CLAIM_SCRIPT = [
  "if redis.call('EXISTS', KEYS[2]) == 1 then return 1 end",
  "if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end",
  "return redis.call('RENAMENX', KEYS[1], KEYS[2])"
].join("\n");
var SAVE_SCRIPT = [
  "redis.call('SET', KEYS[1], ARGV[1])",
  "redis.call('DEL', KEYS[2])",
  "return 1"
].join("\n");
var RELEASE_SCRIPT = [
  "if redis.call('GET', KEYS[1]) == ARGV[1] then",
  "  return redis.call('DEL', KEYS[1])",
  "end",
  "return 0"
].join("\n");
var TRANSITION_PATTERN = /^(\d+(?:,\d+){0,3})?\|(\d+)$/;

module.exports = async function (request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Method not allowed." });
  }

  var secret = process.env.CRON_SECRET;
  if (!secret) return response.status(500).json({ error: "Cron is not configured." });
  if (request.headers.authorization !== "Bearer " + secret) {
    return response.status(401).json({ error: "Unauthorized." });
  }

  var token = crypto.randomBytes(24).toString("hex");
  try {
    var lock = await redis(["SET", LOCK_KEY, token, "NX", "EX", "600"]);
    if (lock !== "OK") return response.status(409).json({ trained: false, reason: "locked" });

    var claimed = await redis([
      "EVAL", CLAIM_SCRIPT, "2", PENDING_KEY, PROCESSING_KEY
    ]);
    if (Number(claimed) !== 1) {
      return response.status(200).json({ trained: false, examples: 0 });
    }

    var entries = await redis(["HGETALL", PROCESSING_KEY]);
    if (!Array.isArray(entries) || entries.length % 2 !== 0) {
      throw new Error("Pending training data is malformed.");
    }

    var stored = await redis(["GET", MODEL_KEY]);
    var model = stored ? JSON.parse(stored) : PianoModel.create();
    if (!PianoModel.isValid(model)) throw new Error("Stored model is invalid.");

    var trainedExamples = 0;
    for (var index = 0; index < entries.length; index += 2) {
      var match = TRANSITION_PATTERN.exec(entries[index]);
      var count = Number(entries[index + 1]);
      if (!match || !Number.isSafeInteger(count) || count < 1) {
        throw new Error("Pending training data contains an invalid transition.");
      }

      var context = match[1]
        ? match[1].split(",").map(Number)
        : [];
      var note = Number(match[2]);
      if (context.some(function (value) { return value < 0 || value >= PianoModel.noteCount; }) ||
          !Number.isInteger(note) || note < 0 || note >= PianoModel.noteCount) {
        throw new Error("Pending training data contains an invalid note.");
      }

      for (var sample = 0; sample < count; sample++) {
        PianoModel.learnFromContext(model, context, note);
      }
      trainedExamples += count;
    }

    if (!trainedExamples) {
      await redis(["DEL", PROCESSING_KEY]);
      return response.status(200).json({ trained: false, examples: 0 });
    }

    model.trainedAt = new Date().toISOString();
    await redis([
      "EVAL", SAVE_SCRIPT, "2", MODEL_KEY, PROCESSING_KEY, JSON.stringify(model)
    ]);
    return response.status(200).json({
      trained: true,
      examples: trainedExamples,
      totalExamples: model.examples,
      trainedAt: model.trainedAt
    });
  } catch (error) {
    console.error("Could not train the shared piano model:", error.message);
    return response.status(500).json({ error: "Shared model training failed." });
  } finally {
    try {
      await redis(["EVAL", RELEASE_SCRIPT, "1", LOCK_KEY, token]);
    } catch (error) {
      console.error("Could not release the piano training lock:", error.message);
    }
  }
};
