export default { async fetch(request, env) { return env.ORIGIN.fetch(request); } };
