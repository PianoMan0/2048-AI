"use strict";

function getConfiguration() {
  var url = process.env.UPSTASH_REDIS_REST_URL;
  var token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Shared Redis is not configured.");
  return { url: url.replace(/\/+$/, ""), token: token };
}

async function command(args) {
  var config = getConfiguration();
  var response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + config.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  });
  var result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(result.error || "Redis request failed.");
  }
  return result.result;
}

module.exports = { command: command };
