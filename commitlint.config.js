module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature (triggers MINOR version bump)
        'fix',      // Bug fix (triggers PATCH version bump)
        'docs',     // Documentation changes
        'style',    // Formatting, whitespace, etc.
        'refactor', // Code change that neither fixes a bug nor adds a feature
        'perf',     // Performance improvement (triggers PATCH version bump)
        'test',     // Adding or updating tests
        'build',    // Changes affecting build system or external dependencies
        'ci',       // CI configuration files and scripts
        'chore',    // Maintenance tasks, repo configs
        'revert',   // Reverting previous commits
      ],
    ],
    'subject-case': [0], // Allow flexible casing in subject
  },
};
