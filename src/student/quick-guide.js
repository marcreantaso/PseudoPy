const StudentGuide = (() => {
    const entries = {
        'Basics': [
            'Wrap your program in BEGIN and END. Instructions go between them.',
            'BEGIN\n    DISPLAY "Hello!"\nEND',
            'print("Hello!")',
            { intro: 'Every program starts with BEGIN, has its instructions in the middle, and ends with END. The translator requires these markers and ignores blank lines.', bullets: ['Keywords are not case-sensitive, but DISPLAY expects a value or text after it.', 'There is no automatic END: blocks only close when you explicitly close them.', 'DECLARE must appear before you SET or use a variable.'] }
        ],
        'Variables': [
            'A variable is a name for a value. DECLARE chooses its type; SET stores a value.',
            'BEGIN\n    DECLARE total AS INTEGER\n    SET total TO 10\n    DISPLAY total\nEND',
            'total = 0\ntotal = 10\nprint(total)',
            { intro: 'Think of DECLARE as reserving a named slot of a fixed type, and SET as storing a value into that slot.', bullets: ['INTEGER fits whole numbers, REAL fits decimals, STRING fits text, BOOLEAN fits TRUE/FALSE.', 'Re-declaring a variable is an error; declare each variable once.', 'A variable must be declared before it is read.'] }
        ],
        'Input & Output': [
            'INPUT asks for a value. DISPLAY shows a result. Declare numeric inputs before reading them.',
            'BEGIN\n    DECLARE age AS INTEGER\n    INPUT age\n    DISPLAY "Age:", age\nEND',
            'age = int(input())\nprint("Age:", age)',
            { intro: 'INPUT reads one value and stores it in the named variable; DISPLAY prints text or a value to the screen.', bullets: ['Declare numeric variables AS INTEGER or AS REAL before INPUT — a later INPUT does not change the type.', 'Separate multiple DISPLAY items with a comma: DISPLAY "Score:", grade', 'Print any text first when combining text and a value: DISPLAY "Age:", age'] }
        ],
        'Conditions': [
            'Start with IF condition THEN. Finish the block with END IF.',
            'BEGIN\n    DECLARE grade AS INTEGER\n    SET grade TO 80\n    IF grade >= 75 THEN\n        DISPLAY "Passed"\n    END IF\nEND',
            'grade = 80\nif grade >= 75:\n    print("Passed")',
            { intro: 'An IF statement chooses between blocks based on a condition. Conditions compare values using comparison operators.', bullets: ['Write IF condition THEN ... END IF. ELSE IF and ELSE are optional but must belong to the matching block.', 'The condition must be a comparison or a boolean (TRUE/FALSE), never an assignment.', 'Nested IFs close innermost-first: each END IF closes the most recent open IF.'] }
        ],
        'Loops': [
            'FOR repeats for a range, including the end value. WHILE repeats while its condition is true. Both need DO and a matching END.',
            'BEGIN\n    FOR i FROM 1 TO 5 DO\n        DISPLAY i\n    END FOR\nEND',
            'for i in range(1, 6):\n    print(i)',
            { intro: 'FOR counts over a range and stops when the counter passes the end value; WHILE repeats while a condition stays true.', bullets: ['FOR i FROM 1 TO n DO ... END FOR includes both 1 and n.', 'Set the step with BY: FOR i FROM 2 TO 10 BY 2 DO', 'Do not rely on the loop variable after the loop; declare your own when you need the final value.'] }
        ],
        'While Loops': [
            'Change the condition inside a WHILE loop so it can eventually stop.',
            'BEGIN\n    DECLARE count AS INTEGER\n    SET count TO 1\n    WHILE count <= 3 DO\n        DISPLAY count\n        SET count TO count + 1\n    END WHILE\nEND',
            'count = 1\nwhile count <= 3:\n    print(count)\n    count = count + 1',
            { intro: 'A WHILE loop checks its condition before each iteration, so the body must change the condition to eventually reach false.', bullets: ['Write WHILE condition DO ... END WHILE.', 'If the condition never changes, the loop runs forever — update your counter inside the body.', 'Check the initial value too: the body may never run at all if the condition starts false.'] }
        ],
        'Comments': [
            'Use # to leave a note. The translator ignores comments. // is a comment only at the beginning of a line.',
            'BEGIN\n    # Explain your next instruction\n    DISPLAY "Hello" # A greeting\nEND',
            '# Explain your next instruction\nprint("Hello") # A greeting',
            { intro: 'Comments explain your code to people. The translator ignores them, so they never affect what runs.', bullets: ['# comments out the rest of the line.', '// is only a comment when the line starts with it (then it works the same as #).', 'Keep comments on their own line or after the instruction; do not split an instruction with a comment.'] }
        ],
        'Common Mistakes': [
            'Match each opening block with its closing instruction. Use THEN after IF and DO after a loop condition.',
            'BEGIN\n    IF 2 > 1 THEN\n        DISPLAY "True"\n    END IF\nEND',
            'if 2 > 1:\n    print("True")',
            { intro: 'Most beginners trip on block structure and ordering. Check these before asking for help.', bullets: ['Every IF needs THEN; every FOR/WHILE needs DO; every opened block needs its matching END.', 'Declare variables near the top, before they are used.', 'The first statement after BEGIN should be an instruction, not another BEGIN.'] }
        ]
    };
    const operators = [ ['+', 'Addition', '2 + 3'], ['-', 'Subtraction', '5 - 2'], ['*', 'Multiplication', '3 * 4'], ['/', 'Division', '7 / 2'], ['//', 'Floor division (DIV)', '7 // 2'], ['%', 'Remainder (MOD)', '7 % 2'], ['**', 'Exponent', '2 ** 3'], ['==', 'Equal to', '2 == 2'], ['!=', 'Not equal to', '2 != 3'], ['<', 'Less than', '2 < 3'], ['<=', 'Less than or equal', '2 <= 3'], ['>', 'Greater than', '3 > 2'], ['>=', 'Greater than or equal', '3 >= 2'], ['AND', 'Both conditions', '2 < 3 AND 3 < 4'], ['OR', 'At least one condition', '2 > 3 OR 3 < 4'], ['NOT', 'Reverse a condition', 'NOT (2 > 3)'] ];
    function tip(text, cursor) {
        const line = text.slice(0, cursor).split('\n').pop().trim();
        if (/^(ELSE\s+)?IF\b/i.test(line) && !/\bTHEN\b/i.test(line)) return 'IF conditions need THEN: IF grade >= 75 THEN';
        if (/^(WHILE|FOR)\b/i.test(line) && !/\bDO\b/i.test(line)) return 'Loops need DO after the condition or range, and a matching END WHILE or END FOR.';
        if (/^INPUT\b/i.test(line)) return 'Reading a number? Declare the variable AS INTEGER or REAL before INPUT.';
        if (/^DISPLAY\b/i.test(line)) return 'Use a comma to display text and a value: DISPLAY "Total:", total';
        return '';
    }
    function insert(text, cursor, example) {
        return text.slice(0, cursor) + (cursor && text[cursor - 1] !== '\n' ? '\n' : '') + example + '\n' + text.slice(cursor);
    }
    return { entries, operators, tip, insert };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = StudentGuide;