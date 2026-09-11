/* ============================================================
   PSEUDOPY — NATURAL LANGUAGE MAPPER (mapper.js)
   ────────────────────────────────────────────────────────────
   Converts unstructured natural language into structured 
   pseudocode using rule-based pattern matching. 
   Runs before lexical analysis.
   ============================================================ */

class NaturalLanguageMapper {
    constructor() {
        // ── Arithmetic word-phrase rules (global, applied before structural rules) ──
        // These are applied as global substitutions on every line.
        this.arithmeticPhrases = [
            // Multi-word arithmetic phrases must come BEFORE single-word ones
            { pattern: /\bMULTIPLIED\s+BY\b/gi,  replacement: '*'   },
            { pattern: /\bDIVIDED\s+BY\b/gi,     replacement: '/'   },
            { pattern: /\bPLUS\b/gi,             replacement: '+'   },
            { pattern: /\bMINUS\b/gi,            replacement: '-'   },
        ];

        // ── Comparison word-phrase rules (global, applied before structural rules) ──
        // Longer phrases must be listed first to avoid partial matches.
        this.comparisonPhrases = [
            { pattern: /\bIS\s+GREATER\s+THAN\s+OR\s+EQUAL\s+TO\b/gi, replacement: '>='  },
            { pattern: /\bIS\s+LESS\s+THAN\s+OR\s+EQUAL\s+TO\b/gi,    replacement: '<='  },
            { pattern: /\bIS\s+NOT\s+EQUAL\s+TO\b/gi,                 replacement: '!='  },
            { pattern: /\bIS\s+EQUAL\s+TO\b/gi,                       replacement: '=='  },
            { pattern: /\bIS\s+GREATER\s+THAN\b/gi,                   replacement: '>'   },
            { pattern: /\bIS\s+LESS\s+THAN\b/gi,                      replacement: '<'   },
        ];

        // ── Structural mapping rules (regex pattern -> replacement string) ──
        this.rules = [
            // Assignment / Set
            { pattern: /^(?:set|make|assign|let)\s+(?:variable\s+)?([a-zA-Z_]\w*)\s+(?:to|equal to|be|=|as)\s+(.+)$/i, replacement: "SET $1 TO $2" },
            
            // Loop: For
            { pattern: /^(?:loop|iterate|for)\s+(?:from)\s+(.+)\s+to\s+(.+)$/i, replacement: "FOR i FROM $1 TO $2 DO" },
            { pattern: /^(?:loop|iterate|for)\s+([a-zA-Z_]\w*)\s+(?:from)\s+(.+)\s+to\s+(.+)$/i, replacement: "FOR $1 FROM $2 TO $3 DO" },
            
            // Loop: For Each
            { pattern: /^(?:loop|iterate|for)\s+(?:each|every)\s+([a-zA-Z_]\w*)\s+(?:in|inside)\s+(.+)$/i, replacement: "FOR EACH $1 IN $2 DO" },
            
            // Loop: While
            { pattern: /^(?:loop|iterate|while)\s+(?:as long as|while)\s+(.+)$/i, replacement: "WHILE $1 DO" },
            
            // Output / Print
            { pattern: /^(?:print|display|output|show)\s+(.+)$/i, replacement: "DISPLAY $1" },
            
            // Input / Read
            { pattern: /^(?:read|input|get|ask for)\s+(?:variable\s+)?([a-zA-Z_]\w*)$/i, replacement: "INPUT $1" },
            { pattern: /^(?:ask|prompt)\s+(?:user\s+)?for\s+([a-zA-Z_]\w*)$/i, replacement: "INPUT $1" },
            
            // Conditional: If — only append THEN if not already present
            { pattern: /^(?:if|check if|when)\s+(.+?)(?:\s+THEN)?$/i, replacement: "IF $1 THEN" },
            { pattern: /^(?:otherwise|else)$/i, replacement: "ELSE" },
            { pattern: /^(?:otherwise if|else if)\s+(.+?)(?:\s+THEN)?$/i, replacement: "ELSE IF $1 THEN" },
            
            // Blocks
            { pattern: /^(?:start|begin)$/i, replacement: "BEGIN" },
            { pattern: /^(?:stop|finish|end)$/i, replacement: "END" },
            { pattern: /^(?:end\s+if|close\s+if)$/i, replacement: "END IF" },
            { pattern: /^(?:end\s+loop|end\s+for|close\s+loop)$/i, replacement: "END FOR" },
            { pattern: /^(?:end\s+while|close\s+while)$/i, replacement: "END WHILE" },

            // Declaration
            { pattern: /^(?:declare|create)\s+(?:variable\s+)?([a-zA-Z_]\w*)\s+as\s+a?\s*([a-zA-Z_]+)$/i, replacement: "DECLARE $1 AS $2" }
        ];
    }

    /**
     * Apply global word-phrase substitutions (arithmetic + comparison) to a single line.
     * These run BEFORE structural mapping so they work inside any expression context.
     */
    applyPhrases(line) {
        // Skip comment lines
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return line;

        // Protect strings and inline # comments from word-phrase replacement.
        const segments = line.split(/((?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|#.*$)/g);
        const result = segments.map(segment => {
            if (!segment || /^["'#]/.test(segment)) return segment || '';
            for (const rule of [...this.comparisonPhrases, ...this.arithmeticPhrases]) segment = segment.replace(rule.pattern, rule.replacement);
            return segment;
        }).join('');
        return result;
    }

    /**
     * Map natural language text to structured pseudocode
     * @param {string} text - The input natural language code
     * @returns {string} The structured pseudocode
     */
    map(text) {
        if (!text) return text;
        const lines = text.split('\n');
        // Phase 1: apply arithmetic + comparison word-phrase substitutions
        const phraseMapped = lines.map(line => this.applyPhrases(line));
        // Phase 2: apply structural mapping rules
        const mappedLines = phraseMapped.map(line => this.mapLine(line));
        return mappedLines.join('\n');
    }

    /**
     * Maps a single line using the defined rules
     */
    mapLine(line) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return line; // preserve whitespace and comments

        // Structured pseudocode must keep its explicit sentinels. Never append a
        // second DO or silently supply a missing THEN during assessment.
        if (/^(BEGIN|END|DECLARE|SET|DISPLAY|PRINT|OUTPUT|INPUT|READ|IF|ELSE|WHILE|FOR|FUNCTION|PROCEDURE|RETURN|CALL|INCREMENT|DECREMENT|APPEND)\b/i.test(trimmed)) return line;
        let result = trimmed;
        for (const rule of this.rules) {
            if (rule.pattern.test(result)) {
                result = result.replace(rule.pattern, rule.replacement);
                break; // Stop after first match to avoid compounding replacements
            }
        }
        
        // Restore leading whitespace for indentation
        const leadingWhitespace = line.match(/^\s*/)[0];
        return leadingWhitespace + result;
    }
}

// Global instance
const nlpMapper = new NaturalLanguageMapper();
console.log('[Mapper] NaturalLanguageMapper initialized.');

