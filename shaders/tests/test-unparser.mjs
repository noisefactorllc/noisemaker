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
    // 1-2 params stay inline, chain on separate lines with 2-space indent
    const expected = `search basics

noise(scale: 3)
  .write(o0)`;
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
    // 1-2 params inline, chain on separate lines with 2-space indent
    const expected = `search basics, nm

noise(scale: 3)
  .blur(radius: 5)
  .write(o0)`;
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
    // Write is on its own line with 2-space indent
    assertIncludes(result, '\n  .write(o5)', 'Should have .write(o5) on new line with 2-space indent');
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

// Test 7: Render directive with o surface
test('Render directive - o1 surface', () => {
    const compiled = {
        searchNamespaces: ['basics'],
        render: 'o1',
        plans: [
            {
                chain: [{ op: 'basics.noise', args: { scale: 3 } }],
                write: { kind: 'output', name: 'o1' }
            }
        ]
    };
    const result = unparse(compiled, {}, {});
    assertIncludes(result, 'render(o1)', 'Should output render(o1)');
});

// Test 8: Render directive with o0 surface
test('Render directive - o0 surface', () => {
    const compiled = {
        searchNamespaces: ['basics'],
        render: 'o0',
        plans: [
            {
                chain: [{ op: 'basics.noise', args: { scale: 3 } }],
                write: { kind: 'output', name: 'o0' }
            }
        ]
    };
    const result = unparse(compiled, {}, {});
    assertIncludes(result, 'render(o0)', 'Should output render(o0)');
});

// Test 10: No render directive (render=null)
test('Render directive - null (no directive)', () => {
    const compiled = {
        searchNamespaces: ['basics'],
        render: null,
        plans: [
            {
                chain: [{ op: 'basics.noise', args: { scale: 3 } }],
                write: { kind: 'output', name: 'o0' }
            }
        ]
    };
    const result = unparse(compiled, {}, {});
    assertNotIncludes(result, 'render(', 'Should not output render() when render is null');
});

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
