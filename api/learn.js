"use strict";

var SharedModel = require("../lib/shared_model");
var PianoModel = require("../model/piano_model");

var MAX_EXAMPLES_PER_BATCH = 64;
var MAX_REQUEST_IDS = 1600;
var NOTE_COUNT = 88;
var CONTEXT_LENGTH = 4;
var REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

function parseExamples(body) {
  var examples = body && body.examples;
  if (!Array.isArray(examples) || examples.length === 0 ||
      examples.length > MAX_EXAMPLES_PER_BATCH) return null;

  for (var index = 0; index < examples.length; index++) {
    var example = examples[index];
    if (!example || !Array.isArray(example.context) ||
        example.context.length > CONTEXT_LENGTH ||
        !Number.isInteger(example.note) || example.note < 0 ||
        example.note >= NOTE_COUNT ||
        !example.context.every(function (note) {
          return Number.isInteger(note) && note >= 0 && note < NOTE_COUNT;
        })) return null;
  }
  return examples;
}

function pause(milliseconds) {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

module.exports = async function (request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed." });
  }

  var examples = parseExamples(request.body);
  var requestId = request.body && request.body.requestId;
  if (!examples || typeof requestId !== "string" ||
      !REQUEST_ID_PATTERN.test(requestId)) {
    return response.status(400).json({ error: "Invalid note examples." });
  }

  for (var attempt = 0; attempt < 8; attempt++) {
    try {
      var day = SharedModel.utcDay();
      var saved = await SharedModel.readRecord();
      if (!saved) {
        await SharedModel.createRecordIfMissing(SharedModel.createRecord(day));
        continue;
      }

      var record = saved.record;
      if (record.recentRequestIds.indexOf(requestId) !== -1) {
        return response.status(202).json({ accepted: examples.length, duplicate: true });
      }

      var dailyExamples = record.contributionDate === day ? record.dailyExamples : 0;
      if (dailyExamples + examples.length > SharedModel.maxExamplesPerDay) {
        return response.status(429).json({ error: "Daily contribution limit reached." });
      }

      examples.forEach(function (example) {
        PianoModel.learnFromContext(record.model, example.context, example.note);
      });
      record.model.trainedAt = new Date().toISOString();
      record.contributionDate = day;
      record.dailyExamples = dailyExamples + examples.length;
      record.recentRequestIds.push(requestId);
      if (record.recentRequestIds.length > MAX_REQUEST_IDS) {
        record.recentRequestIds.shift();
      }

      try {
        await SharedModel.saveRecord(record, saved.etag);
        return response.status(202).json({ accepted: examples.length });
      } catch (error) {
        var latest = await SharedModel.readRecord();
        if (!latest || latest.etag === saved.etag) throw error;
      }
    } catch (error) {
      console.error("Could not save shared piano examples:", error.message);
      return response.status(503).json({ error: "Shared learning is unavailable." });
    }

    await pause((attempt + 1) * 25);
  }

  return response.status(503).json({ error: "Shared model is busy. Please retry." });
};
