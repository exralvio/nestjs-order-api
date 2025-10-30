module.exports = {
  apps: [
    {
      name: "api",
      script: "dist/src/main.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "consumer",
      script: "dist/src/consumer/main.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
