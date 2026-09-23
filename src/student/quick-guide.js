const StudentGuide = (() => {
    const entries = {
        'Basics': ['Wrap your program in BEGIN and END. Instructions go between them.', 'BEGIN\n    DISPLAY "Hello!"\nEND', 'print("Hello!")'],
        'Variables': ['A variable is a name for a value. DECLARE chooses its type; SET stores a value.', 'BEGIN\n    DECLARE total AS INTEGER\n    SET total TO 10\n    DISPLAY total\nEND', 'total = 0\ntotal = 10\nprint(total)'],
        'Input & Output': ['INPUT asks for a value. DISPLAY shows a result. Declare numeric inputs before reading them.', 'BEGIN\n    DECLARE age AS INTEGER\n    INPUT age\n    DISPLAY "Age:", age\nEND', 'age = int(input())\nprint("Age:", age)'],
        'Conditions': ['Start with IF condition THEN. Finish the block with END IF.', 'BEGIN\n    DECLARE grade AS INTEGER\n    SET grade TO 80\n    IF grade >= 75 THEN\n        DISPLAY "Passed"\n    END IF\nEND', 'grade = 80\nif grade >= 75:\n    print("Passed")'],
        'Loops': ['FOR repeats for a range, including the end value. WHILE repeats while its condition is true. Both need DO and a matching END.', 'BEGIN\n    FOR i FROM 1 TO 5 DO\n        DISPLAY i\n    END FOR\nEND', 'for i in range(1, 6):\n    print(i)'],
        'While Loops': ['Change the condition inside a WHILE loop so it can eventually stop.', 'BEGIN\n    DECLARE count AS INTEGER\n    SET count TO 1\n    WHILE count <= 3 DO\n        DISPLAY count\n        SET count TO count + 1\n    END WHILE\nEND', 'count = 1\nwhile count <= 3:\n    print(count)\n    count = count + 1'],
        'Comments': ['Use # to leave a note. The translator ignores comments. // is a comment only at the beginning of a line.', 'BEGIN\n    # Explain your next instruction\n    DISPLAY "Hello" # A greeting\nEND', '# Explain your next instruction\nprint("Hello") # A greeting'],
        'Common Mistakes': ['Match each opening block with its closing instruction. Use THEN after IF and DO after a loop condition.', 'BEGIN\n    IF 2 > 1 THEN\n        DISPLAY "True"\n    END IF\nEND', 'if 2 > 1:\n    print("True")']
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
