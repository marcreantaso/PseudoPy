class PseudocodeCompiler {
    /**
     * compile(code) → { valid, python, errors[], warnings[] }
     *
     * Pipeline:
     *   1. Lexer.tokenize()          — O(N) tokenization
     *   2. Parser.parse()            — CFG validation + AST construction
     *   3. SemanticAnalyzer.analyze() — symbol table + undeclared var checks
     *   4. CodeGenerator.generate()  — SDT tree-walk → Python emission
     */
    compile(rawCode) {
        const pipelineStart = performance.now();
        const autoFixes = [];
        // Live references used only for periodic trace checkpoints. These are
        // filled in as the pipeline advances and stay null for ordinary
        // student-facing translations.
        const traceRefs = { parser: null, semantic: null, tokenCount: 0 };

        compilerTrace.emit({ type: 'COMPILER_START', stage: 'PIPELINE', status: 'RUNNING', data: { rawCodeLength: rawCode.length } });

        // ── Algorithm Simulation ──
        // Opt-in only. When the caller did not enable the tracer, nothing below
        // allocates a payload, snapshot or mapping entry.
        const traceEnv = this.beginSimulationTrace(traceRefs);
        if (traceEnv) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_START, {
                stage: 'PIPELINE',
                line: null,
                column: null,
                payload: { rawCodeLength: rawCode.length }
            });
        }

        // Preprocess to strip leading line numbers
        compilerTrace.emit({ type: 'PREPROCESS_START', stage: 'PREPROCESSING', status: 'RUNNING', data: {} });
        const cleanRawCode = preprocessPseudocode(rawCode);
        compilerTrace.emit({ type: 'PREPROCESS_COMPLETE', stage: 'PREPROCESSING', status: 'SUCCESS', data: { input: rawCode, output: cleanRawCode } });
        if (traceEnv && cleanRawCode !== rawCode) {
            simulationTracer.emit(SIMULATION_TRACE_TYPES.PREPROCESS_APPLIED, {
                stage: 'PREPROCESSING',
                line: null,
                column: null,
                payload: { input: rawCode, output: cleanRawCode, strippedLineNumbers: true }
            });
        }

        // ── Stage 0: Natural Language Mapping ──
        let code = cleanRawCode;
        if (typeof nlpMapper !== 'undefined') {
            compilerTrace.emit({ type: 'NLP_MAP_START', stage: 'NLP_MAPPING', status: 'RUNNING', data: {} });
            code = nlpMapper.map(cleanRawCode);
            compilerTrace.emit({ type: 'NLP_MAP_COMPLETE', stage: 'NLP_MAPPING', status: 'SUCCESS', data: { input: cleanRawCode, output: code, changed: code !== cleanRawCode } });
            if (traceEnv && code !== cleanRawCode) {
                simulationTracer.emit(SIMULATION_TRACE_TYPES.NLP_MAPPING_APPLIED, {
                    stage: 'NLP_MAPPING',
                    line: null,
                    column: null,
                    payload: { input: cleanRawCode, output: code }
                });
            }
        } else {
            compilerTrace.emit({ type: 'NLP_MAP_SKIPPED', stage: 'NLP_MAPPING', status: 'SKIPPED', data: { reason: 'nlpMapper not available' } });
        }

        // ── Stage 1: Lexical Analysis ──
        const t1 = performance.now();
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        traceRefs.tokenCount = tokens.length;
        const lexTime = performance.now() - t1;

        // ── Stage 2: Syntax Analysis (CFG + LIFO stack validation) ──
        const t2 = performance.now();
        const parser = new Parser(tokens);
        traceRefs.parser = parser;
        parser.errors.push(...lexer.errors);
        let ast = parser.parse();
        const parseTime = performance.now() - t2;

        // ── Stage 3: Semantic Analysis (pre-execution variable check) ──
        const t3 = performance.now();
        let semanticAnalyzer = new SemanticAnalyzer();
        traceRefs.semantic = semanticAnalyzer;
        let warnings = semanticAnalyzer.analyze(ast);
        const semanticTime = performance.now() - t3;

        // Build pipeline metrics object
        const metrics = {
            lexTime: parseFloat(lexTime.toFixed(3)),
            parseTime: parseFloat(parseTime.toFixed(3)),
            semanticTime: parseFloat(semanticTime.toFixed(3)),
            codeGenTime: 0,
            totalTime: 0,
            tokenCount: tokens.length,
            astNodeCount: countAstNodes(ast)
        };

        // Syntax errors are hard stops — no code generation (if auto-fix failed)
        if (ast.errors.length > 0) {
            metrics.totalTime = parseFloat((performance.now() - pipelineStart).toFixed(3));
            compilerTrace.emit({ type: 'COMPILATION_FAILURE', stage: 'PIPELINE', status: 'ERROR', data: { errorCount: ast.errors.length, errors: ast.errors } });
            return this.finishSimulationTrace(traceEnv, {
                valid: false, python: '', errors: ast.errors, warnings: warnings, metrics: metrics, mappedCode: code, tokens: tokens, ast: ast, symbolTable: Object.fromEntries(semanticAnalyzer.symbolTable), autoFixes: autoFixes
            });
        }

        // ── Stage 4: Code Generation (SDT tree-walk) ──
        const t4 = performance.now();
        const generator = new CodeGenerator(semanticAnalyzer.symbolTable);
        const pythonCode = generator.generate(ast);
        metrics.codeGenTime = parseFloat((performance.now() - t4).toFixed(3));

        metrics.totalTime = parseFloat((performance.now() - pipelineStart).toFixed(3));

        compilerTrace.emit({ type: 'COMPILATION_SUCCESS', stage: 'PIPELINE', status: 'SUCCESS', data: { totalTime: metrics.totalTime } });

        return this.finishSimulationTrace(traceEnv, {
            valid: true, python: pythonCode, errors: [], warnings: warnings, metrics: metrics, mappedCode: code, tokens: tokens, ast: ast, symbolTable: Object.fromEntries(semanticAnalyzer.symbolTable), autoFixes: autoFixes
        }, generator.sourceMap);
    }

    // ── Algorithm Simulation plumbing ───────────────────────────
    // Both helpers are inert unless a caller explicitly enabled the tracer, so
    // ordinary translations keep their existing shape and cost.

    beginSimulationTrace(traceRefs) {
        // Inert unless a caller opted in. Ordinary translations never reach
        // the tracer, so no event, snapshot or source map is produced.
        if (!simulationTracer.enabled) return null;
        simulationTracer.reset();
        simulationTracer.enable();
        // Read live compiler state only while a checkpoint is being taken.
        simulationTracer.setSnapshotProvider(() => ({
            stage: 'PIPELINE',
            tokenCount: traceRefs.tokenCount,
            blockStack: traceRefs.parser && traceRefs.parser.blockStack ? traceRefs.parser.blockStack.slice() : [],
            symbolTable: traceRefs.semantic ? traceRefs.semantic.symbolSnapshot() : {}
        }));
        return { startedAt: performance.now() };
    }

    finishSimulationTrace(traceEnv, result, sourceMap) {
        if (!traceEnv) return result;

        simulationTracer.captureSnapshot();
        simulationTracer.emit(SIMULATION_TRACE_TYPES.STAGE_END, {
            stage: 'PIPELINE',
            line: null,
            column: null,
            payload: { valid: result.valid === true, errorCount: result.errors.length, warningCount: result.warnings.length, totalTime: result.metrics.totalTime }
        });
        simulationTracer.setSnapshotProvider(null);

        const envelope = simulationTracer.finalize({
            sourceMap: sourceMap || [],
            valid: result.valid === true,
            metrics: result.metrics
        });
        result.simulation = envelope;
        return result;
    }

    /**
     * analyzeComplexity(code) → "O(1)" | "O(N)" | "O(N²)" | ...
     *
     * Counts max nesting depth of FOR/WHILE loops to estimate Big-O.
     */
    analyzeComplexity(code) {
        const lexer = new Lexer(code);
        const tokens = lexer.tokenize();
        let depth = 0, maxDepth = 0;
        let prevWasEnd = false;

        for (const t of tokens) {
            if (t.type === TOKEN_TYPES.KEYWORD) {
                if (prevWasEnd && (t.value === 'FOR' || t.value === 'WHILE')) {
                    depth = Math.max(0, depth - 1);
                    prevWasEnd = false;
                } else if (t.value === 'FOR' || t.value === 'WHILE') {
                    depth++;
                    if (depth > maxDepth) maxDepth = depth;
                    prevWasEnd = false;
                } else if (t.value === 'ENDFOR' || t.value === 'ENDWHILE') {
                    depth = Math.max(0, depth - 1);
                    prevWasEnd = false;
                } else if (t.value === 'END') {
                    prevWasEnd = true;
                } else if (prevWasEnd && (t.value === 'FOR' || t.value === 'WHILE')) {
                    depth = Math.max(0, depth - 1);
                    prevWasEnd = false;
                } else {
                    prevWasEnd = false;
                }
            } else {
                prevWasEnd = false;
            }
        }

        if (maxDepth === 0) return 'O(1)';
        if (maxDepth === 1) return 'O(N)';
        if (maxDepth === 2) return 'O(N\u00B2)';
        return 'O(N^' + maxDepth + ')';
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PseudocodeCompiler, preprocessPseudocode, CompilerTrace, compilerTrace };
}

