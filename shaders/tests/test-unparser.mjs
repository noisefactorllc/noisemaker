/**
 * Unit tests for the DSL unparser
 * Run with: node --input-type=module shaders/tests/test-unparser.mjs
 */

import { unparse } from '../src/lang/unparser.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (err) {
        console.error(`✗ ${name}`);
        console.error(`  ${err.message}`);
        failed++;
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual: ${JSON.stringify(actual)}`);
    }
}

function assertIncludes(str, substr, message) {
    if (!str.includes(substr)) {
        throw new Error(`${message}\n  String does not include: ${JSON.stringify(substr)}\n  Actual: ${JSON.stringify(str)}`);
    }
}

function assertNotIncludes(str, substr, message) {
    if (str.includes(substr)) {
        throw new Error(`${message}\n  String should not include: ${JSON.stringify(substr)}\n  Actual: ${JSON.stringify(str)}`);
    }
}

// Test 1: Basic unparse
test('Basic unparse with single effect', () => {
    const compiled = {
        searchNamespaces: ['basics'],
        plans: [
            {
                chain: [
                    { op: 'basics.noise', args: { scale: 3 } }
                ],
                write: { kind: 'output', name: 'o0' }
            }
        ]
    };
    const result = unparse(compiled, {}, {});
    // New multiline format: two line breaks after search, uniforms on separate lines
    const expected = `search basics

noise(
    scale: 3
).write(o0)`;
    assertEqual(result, expected, 'Basic unparse');
});

// Test 2: Multiple same-named effects with step-specific overrides
test('Step-specific overrides with multiple same-named effects', () => {
    const compiled = {
        searchNamespaces: ['basics'],
        plans: [
            {
                chain: [{ op: 'basics.noise', args: { scale: 3, seed: 1 } }],
                write: { kind: 'output', name: 'o1' }
            },
            {
                chain: [
                    { op: 'basics.noise', args: { scale: 5, seed: 2 } },
                    { op: 'basics.add', args: { amount: 0.5 } }
                ],
                write: { kind: 'output', name: 'o0' }
            }
        ]
    };
    
    // Only modify step 0's scale
    const overrides = { 0: { scale: 10, seed: 1 } };
    const result = unparse(compiled, overrides, {});
    
    // First noise should have scale: 10
    assertIncludes(result, 'scale: 10', 'First noise scale should be 10');
    // Second noise should still have scale: 5
    assertIncludes(result, 'scale: 5', 'Second noise scale should be 5');
    // Seeds should be unchanged
    assertIncludes(result, 'seed: 1', 'First noise seed should be 1');
    assertIncludes(result, 'seed: 2', 'Second noise seed should be 2');
});

// Test 3: Namespace stripping
test('Namespace stripping for search namespaces', () => {
    const compiled = {
        searchNamespaces: ['nm', 'nu'],
        plans: [
            {
                chain: [{ op: 'nm.blur', args: { radius: 5 } }],
                write: { kind: 'output', name: 'o0' }
            }
        ]
    };
    const result = unparse(compiled, {}, {});
    assertIncludes(result, 'blur(', 'Should have blur(');
    assertNotIncludes(result, 'nm.blur(', 'Should not have nm.blur(');
});

// Test 4: Multiple search namespaces
test('Multiple search namespaces with mixed effects', () => {
    const compiled = {
        searchNamespaces: ['basics', 'nm'],
        plans: [
            {
                chain: [
                    { op: 'basics.noise', args: { scale: 3 } },
                    { op: 'nm.blur', args: { radius: 5 } }
                ],
                write: { kind: 'output', name: 'o0' }
            }
        ]
    };
    const result = unparse(compiled, {}, {});
    // New multiline format
    const expected = `search basics, nm

noise(
    scale: 3
).blur(
    radius: 5
).write(o0)`;
    assertEqual(result, expected, 'Multiple namespaces');
});

// Test 5: Output reference handling
test('Output reference as object', () => {
    const compiled = {
        searchNamespaces: ['basics'],
        plans: [
            {
                chain: [{ op: 'basics.noise', args: { scale: 3 } }],
                write: { kind: 'output', name: 'o5' }
            }
        ]
    };
    const result = unparse(compiled, {}, {});
    assertIncludes(result, '.write(o5)', 'Should have .write(o5)');
});

// Test 6: No search namespaces
test('No search namespaces - keep full qualified names', () => {
    const compiled = {
        searchNamespaces: [],
        plans: [
            {
                chain: [{ op: 'basics.noise', args: { scale: 3 } }],
                write: { kind: 'output', name: 'o0' }
            }
        ]
    };
    const result = unparse(compiled, {}, {});
    assertIncludes(result, 'basics.noise(', 'Should have full qualified name');
});

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
