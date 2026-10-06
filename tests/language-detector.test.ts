import { describe, it, expect } from 'vitest';
import { LanguageDetector } from '@codevitals/core';

describe('LanguageDetector', () => {
  it('detects TypeScript', () => {
    expect(LanguageDetector.detect('auth.ts')).toBe('TypeScript');
    expect(LanguageDetector.detect('Component.tsx')).toBe('TypeScript');
  });

  it('detects JavaScript', () => {
    expect(LanguageDetector.detect('server.js')).toBe('JavaScript');
    expect(LanguageDetector.detect('index.jsx')).toBe('JavaScript');
  });

  it('detects Python', () => {
    expect(LanguageDetector.detect('server.py')).toBe('Python');
  });

  it('detects Go', () => {
    expect(LanguageDetector.detect('main.go')).toBe('Go');
  });

  it('detects Java', () => {
    expect(LanguageDetector.detect('User.java')).toBe('Java');
  });

  it('detects Rust', () => {
    expect(LanguageDetector.detect('lib.rs')).toBe('Rust');
  });

  it('detects C, C++, C#, PHP, Ruby, Kotlin, Swift, Shell, JSON, YAML, HTML, CSS, Markdown', () => {
    expect(LanguageDetector.detect('main.c')).toBe('C');
    expect(LanguageDetector.detect('main.cpp')).toBe('C++');
    expect(LanguageDetector.detect('Program.cs')).toBe('C#');
    expect(LanguageDetector.detect('index.php')).toBe('PHP');
    expect(LanguageDetector.detect('app.rb')).toBe('Ruby');
    expect(LanguageDetector.detect('Main.kt')).toBe('Kotlin');
    expect(LanguageDetector.detect('App.swift')).toBe('Swift');
    expect(LanguageDetector.detect('script.sh')).toBe('Shell');
    expect(LanguageDetector.detect('config.json')).toBe('JSON');
    expect(LanguageDetector.detect('config.yaml')).toBe('YAML');
    expect(LanguageDetector.detect('index.html')).toBe('HTML');
    expect(LanguageDetector.detect('style.css')).toBe('CSS');
    expect(LanguageDetector.detect('README.md')).toBe('Markdown');
  });

  it('handles unknown extensions gracefully', () => {
    expect(LanguageDetector.detect('file.unknownextension123')).toBeUndefined();
    expect(LanguageDetector.detect('noextensionfile')).toBeUndefined();
  });
});
