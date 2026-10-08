# PseudoPy Language Specification

This specification is derived from the current implementation (src/compiler/*, mapper.js). It reflects what the system actually accepts and executes.

## Program

- BEGIN ... END (required). Code after END is rejected.

## Lexical

- Case-insensitive keywords; identifiers preserve case.
- Leading numbers stripped (1:, 1), 1. etc with constraints).
- Spaces/tabs skipped; newlines preserved as tokens.
- Comments: # outside strings; // only before token (floor division inside expressions).
- Strings single/double quoted; escapes preserved; no multiline strings.

## Unicode normalizations

=->>=, =-><=, ?->!=, =->==, ×/?/·->*, ÷->/, -/-/–/—->-, ?/?->=, ?->->

## Types

INTEGER, FLOAT, REAL, STRING, CHAR, CHARACTER, BOOLEAN, BOOL, ARRAY

## Statements

Declarations, assignment (scalar/indexed), DISPLAY/PRINT/OUTPUT, INPUT/READ (WITH PROMPT), IF/ELSE IF/ELSE/END IF, WHILE/END WHILE, FOR FROM TO [STEP]/END FOR, FOR EACH IN/END FOR, FUNCTION/PROCEDURE/CALL/RETURN, INCREMENT/DECREMENT/APPEND.

## Expressions

Lists/tuples, arithmetic/bitwise/comparisons/chained, AND/OR/NOT, membership/identity, calls/indexing/slices, constants (TRUE/FALSE/NULL/NONE), DIV/MOD, = and <> aliases.

## Functions & recursion

FUNCTION and PROCEDURE supported; recursive calls supported. Arity/signature validation is incomplete; explicit CALL resolution is limited. Parameters scoped locally.

## Limitations

Input conversion retries vary by declared type. Expression column mapping to original source not preserved. Runtime is Skulpt.
