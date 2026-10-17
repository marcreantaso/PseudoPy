/* ============================================================
   SOP 2 — holdout dataset (30 independently written cases)
   ------------------------------------------------------------
   Provenance and rules (see docs/SOP2_DATASET_AUDIT.md):

   • Written independently of src/database/seed-data.js. The seed set
     was used while designing the compiler; this set is not, so it is
     the generalisation check.
   • Every case uses only constructs documented in
     docs/compiler-language.md. No case relies on unsupported syntax.
   • Deliberately varied style: different keyword spellings
     (SET/…TO, `<-`, `:=`, `=`), sentinel spellings (END IF / ENDIF,
     END FOR / ENDFOR, END WHILE / END WHILE), OUTPUT/PRINT/DISPLAY,
     numbered lines, comments, and different naming conventions.
   • No student names, no classroom identifiers.
   • python_code is the independent reference solution, written from
     the same task, not copied from PseudoPy output.

   Each reference prints a deterministic value and uses no stdin.
   ============================================================ */
(function (root) {
  'use strict';

  var CASES = [
    {
      id: 'holdout_1',
      title: 'Accumulate Integers Up To Twenty',
      concept: 'Iteration',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE total AS INTEGER',
        '  total = 0',
        '  DECLARE k AS INTEGER',
        '  k = 1',
        '  WHILE k <= 20 DO',
        '    total = total + k',
        '    k = k + 1',
        '  END WHILE',
        '  PRINT total',
        'END'
      ].join('\n'),
      python_code: 'total = 0\nk = 1\nwhile k <= 20:\n    total = total + k\n    k = k + 1\nprint(total)'
    },
    {
      id: 'holdout_2',
      title: 'Count Down From Five',
      concept: 'Reverse iteration',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  FOR i FROM 5 TO 1 STEP -1 DO',
        '    DISPLAY i',
        '  END FOR',
        'END'
      ].join('\n'),
      python_code: 'for i in range(5, 1 - 1, -1):\n    print(i)'
    },
    {
      id: 'holdout_3',
      title: 'Report Even Values In A Range',
      concept: 'Modulo branching',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE n AS INTEGER',
        '  n = 0',
        '  WHILE n <= 10 DO',
        '    IF n MOD 2 == 0 THEN',
        '      DISPLAY n',
        '    END IF',
        '    n = n + 1',
        '  END WHILE',
        'END'
      ].join('\n'),
      python_code: 'n = 0\nwhile n <= 10:\n    if n % 2 == 0:\n        print(n)\n    n = n + 1'
    },
    {
      id: 'holdout_4',
      title: 'Largest Value In A Collection',
      concept: 'Reduction',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE values AS ARRAY',
        '  values = [3, 41, 7, 19, 12]',
        '  DECLARE top AS INTEGER',
        '  top = 0',
        '  FOR EACH v IN values DO',
        '    IF v > top THEN',
        '      top = v',
        '    END IF',
        '  END FOR',
        '  OUTPUT top',
        'END'
      ].join('\n'),
      python_code: 'values = [3, 41, 7, 19, 12]\ntop = 0\nfor v in values:\n    if v > top:\n        top = v\nprint(top)'
    },
    {
      id: 'holdout_5',
      title: 'Factorial By Multiplication Loop',
      concept: 'Accumulator',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE p AS INTEGER',
        '  DECLARE i AS INTEGER',
        '  SET p TO 1',
        '  FOR i FROM 1 TO 5 DO',
        '    p = p * i',
        '  END FOR',
        '  PRINT p',
        'END'
      ].join('\n'),
      python_code: 'p = 1\nfor i in range(1, 5 + 1):\n    p = p * i\nprint(p)'
    },
    {
      id: 'holdout_6',
      title: 'Mean Of A List Using Integer Division',
      concept: 'Aggregation',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE nums AS ARRAY',
        '  DECLARE total AS INTEGER',
        '  DECLARE n AS INTEGER',
        '  nums = [10, 20, 30, 40]',
        '  total = 0',
        '  n = 0',
        '  FOR EACH x IN nums DO',
        '    total = total + x',
        '    n = n + 1',
        '  END FOR',
        '  PRINT total DIV n',
        'END'
      ].join('\n'),
      python_code: 'nums = [10, 20, 30, 40]\ntotal = 0\nn = 0\nfor x in nums:\n    total = total + x\n    n = n + 1\nprint(total // n)'
    },
    {
      id: 'holdout_7',
      title: 'First Ten Fibonacci Terms',
      concept: 'Sequence',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE a AS INTEGER',
        '  DECLARE b AS INTEGER',
        '  DECLARE nxt AS INTEGER',
        '  DECLARE i AS INTEGER',
        '  a = 0',
        '  b = 1',
        '  FOR i FROM 1 TO 10 DO',
        '    DISPLAY a',
        '    nxt = a + b',
        '    a = b',
        '    b = nxt',
        '  ENDFOR',
        'END'
      ].join('\n'),
      python_code: 'a = 0\nb = 1\nfor i in range(1, 10 + 1):\n    print(a)\n    nxt = a + b\n    a = b\n    b = nxt'
    },
    {
      id: 'holdout_8',
      title: 'Greatest Common Divisor',
      concept: 'Euclidean algorithm',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE a AS INTEGER',
        '  DECLARE b AS INTEGER',
        '  DECLARE r AS INTEGER',
        '  a = 48',
        '  b = 18',
        '  WHILE b != 0 DO',
        '    r = a MOD b',
        '    a = b',
        '    b = r',
        '  END WHILE',
        '  DISPLAY a',
        'END'
      ].join('\n'),
      python_code: 'a = 48\nb = 18\nwhile b != 0:\n    r = a % b\n    a = b\n    b = r\nprint(a)'
    },
    {
      id: 'holdout_9',
      title: 'Count Vowels In A Word',
      concept: 'String iteration and membership',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE word AS STRING',
        '  DECLARE count AS INTEGER',
        '  DECLARE ch AS CHARACTER',
        '  word = "pseudocode"',
        '  count = 0',
        '  FOR EACH ch IN word DO',
        '    IF ch IN "aeiou" THEN',
        '      count = count + 1',
        '    END IF',
        '  END FOR',
        '  PRINT count',
        'END'
      ].join('\n'),
      python_code: 'word = "pseudocode"\ncount = 0\nfor ch in word:\n    if ch in "aeiou":\n        count = count + 1\nprint(count)'
    },
    {
      id: 'holdout_10',
      title: 'Reverse A List In Place',
      concept: 'Two-pointer swap',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE arr AS ARRAY',
        '  DECLARE left AS INTEGER',
        '  DECLARE right AS INTEGER',
        '  DECLARE temp AS INTEGER',
        '  arr = [1, 2, 3, 4, 5]',
        '  left = 0',
        '  right = 4',
        '  WHILE left < right DO',
        '    temp = arr[left]',
        '    arr[left] = arr[right]',
        '    arr[right] = temp',
        '    left = left + 1',
        '    right = right - 1',
        '  END WHILE',
        '  PRINT arr',
        'END'
      ].join('\n'),
      python_code: 'arr = [1, 2, 3, 4, 5]\nleft = 0\nright = 4\nwhile left < right:\n    temp = arr[left]\n    arr[left] = arr[right]\n    arr[right] = temp\n    left = left + 1\n    right = right - 1\nprint(arr)'
    },
    {
      id: 'holdout_11',
      title: 'Sum Of Squares One To Five',
      concept: 'Accumulation',
      difficulty: 'easy',
      pseudocode: [
        '1 BEGIN',
        '2   DECLARE s AS INTEGER',
        '3   DECLARE i AS INTEGER',
        '4   s = 0',
        '5   FOR i FROM 1 TO 5 DO',
        '6     s = s + i * i',
        '7   END FOR',
        '8   DISPLAY s',
        '9 END'
      ].join('\n'),
      python_code: 's = 0\nfor i in range(1, 5 + 1):\n    s = s + i * i\nprint(s)'
    },
    {
      id: 'holdout_12',
      title: 'Multiples Of Three',
      concept: 'Stepped iteration',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE i AS INTEGER',
        '  FOR i FROM 3 TO 12 STEP 3 DO',
        '    DISPLAY i',
        '  END FOR   # inclusive bounds',
        'END'
      ].join('\n'),
      python_code: 'for i in range(3, 12 + 1, 3):\n    print(i)'
    },
    {
      id: 'holdout_13',
      title: 'Sum Of Even Numbers To Twenty',
      concept: 'Stepped accumulation',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE s AS INTEGER',
        '  DECLARE k AS INTEGER',
        '  s = 0',
        '  FOR k FROM 2 TO 20 STEP 2 DO',
        '    s = s + k',
        '  END FOR',
        '  OUTPUT s',
        'END'
      ].join('\n'),
      python_code: 's = 0\nfor k in range(2, 20 + 1, 2):\n    s = s + k\nprint(s)'
    },
    {
      id: 'holdout_14',
      title: 'Smallest Value In A Collection',
      concept: 'Reduction',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE vals AS ARRAY',
        '  DECLARE low AS INTEGER',
        '  DECLARE v AS INTEGER',
        '  vals = [8, -4, 15, 0, 7]',
        '  low = vals[0]',
        '  FOR EACH v IN vals DO',
        '    IF v < low THEN',
        '      low = v',
        '    END IF',
        '  END FOR',
        '  PRINT low',
        'END'
      ].join('\n'),
      python_code: 'vals = [8, -4, 15, 0, 7]\nlow = vals[0]\nfor v in vals:\n    if v < low:\n        low = v\nprint(low)'
    },
    {
      id: 'holdout_15',
      title: 'Factorial By Recursion',
      concept: 'Recursion',
      difficulty: 'hard',
      pseudocode: [
        'BEGIN',
        '  FUNCTION factorial(n)',
        '    IF n <= 1 THEN',
        '      RETURN 1',
        '    END IF',
        '    RETURN n * factorial(n - 1)',
        '  END FUNCTION',
        '  DISPLAY factorial(5)',
        'END'
      ].join('\n'),
      python_code: 'def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\nprint(factorial(5))'
    },
    {
      id: 'holdout_16',
      title: 'Greeting Procedure',
      concept: 'Procedure and call',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  PROCEDURE greet(name)',
        '    DISPLAY "Hello", name',
        '  END PROCEDURE',
        '  CALL greet("World")',
        'END'
      ].join('\n'),
      python_code: 'def greet(name):\n    print("Hello", name)\ngreet("World")'
    },
    {
      id: 'holdout_17',
      title: 'Nested Loop Accumulation',
      concept: 'Nested iteration',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE total AS INTEGER',
        '  DECLARE i AS INTEGER',
        '  DECLARE j AS INTEGER',
        '  total = 0',
        '  FOR i FROM 1 TO 3 DO',
        '    FOR j FROM 1 TO 3 DO',
        '      total = total + i * j',
        '    END FOR',
        '  END FOR',
        '  PRINT total',
        'END'
      ].join('\n'),
      python_code: 'total = 0\nfor i in range(1, 3 + 1):\n    for j in range(1, 3 + 1):\n        total = total + i * j\nprint(total)'
    },
    {
      id: 'holdout_18',
      title: 'Linear Search For A Value',
      concept: 'Search',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE items AS ARRAY',
        '  DECLARE target AS INTEGER',
        '  DECLARE found AS INTEGER',
        '  DECLARE i AS INTEGER',
        '  items = [4, 9, 15, 22, 31]',
        '  target = 22',
        '  found = -1',
        '  FOR i FROM 0 TO 4 DO',
        '    IF items[i] == target THEN',
        '      found = i',
        '    END IF',
        '  END FOR',
        '  DISPLAY found',
        'END'
      ].join('\n'),
      python_code: 'items = [4, 9, 15, 22, 31]\ntarget = 22\nfound = -1\nfor i in range(0, 4 + 1):\n    if items[i] == target:\n        found = i\nprint(found)'
    },
    {
      id: 'holdout_19',
      title: 'Sort A Small List',
      concept: 'Sorting',
      difficulty: 'hard',
      pseudocode: [
        'BEGIN',
        '  DECLARE data AS ARRAY',
        '  DECLARE i AS INTEGER',
        '  DECLARE j AS INTEGER',
        '  DECLARE tmp AS INTEGER',
        '  data = [5, 2, 8, 3]',
        '  FOR i FROM 0 TO 3 DO',
        '    FOR j FROM 0 TO 2 DO',
        '      IF data[j] > data[j + 1] THEN',
        '        tmp = data[j]',
        '        data[j] = data[j + 1]',
        '        data[j + 1] = tmp',
        '      END IF',
        '    END FOR',
        '  END FOR',
        '  PRINT data',
        'END'
      ].join('\n'),
      python_code: 'data = [5, 2, 8, 3]\nfor i in range(0, 3 + 1):\n    for j in range(0, 2 + 1):\n        if data[j] > data[j + 1]:\n            tmp = data[j]\n            data[j] = data[j + 1]\n            data[j + 1] = tmp\nprint(data)'
    },
    {
      id: 'holdout_20',
      title: 'Length Of A Word',
      concept: 'Built-in expression',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE word AS STRING',
        '  word = "pseudopy"',
        '  DISPLAY len(word)',
        'END'
      ].join('\n'),
      python_code: 'word = "pseudopy"\nprint(len(word))'
    },
    {
      id: 'holdout_21',
      title: 'Digit Sum Of A Number',
      concept: 'Modulo and division',
      difficulty: 'hard',
      pseudocode: [
        'BEGIN',
        '  DECLARE n AS INTEGER',
        '  DECLARE total AS INTEGER',
        '  n = 1234',
        '  total = 0',
        '  WHILE n > 0 DO',
        '    total = total + (n MOD 10)',
        '    n = n DIV 10',
        '  END WHILE',
        '  DISPLAY total',
        'END'
      ].join('\n'),
      python_code: 'n = 1234\ntotal = 0\nwhile n > 0:\n    total = total + (n % 10)\n    n = n // 10\nprint(total)'
    },
    {
      id: 'holdout_22',
      title: 'Powers Of Two',
      concept: 'Exponentiation',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE e AS INTEGER',
        '  FOR e FROM 1 TO 5 DO',
        '    DISPLAY 2 ** e',
        '  END FOR',
        'END'
      ].join('\n'),
      python_code: 'for e in range(1, 5 + 1):\n    print(2 ** e)'
    },
    {
      id: 'holdout_23',
      title: 'Leap Year Test',
      concept: 'Boolean logic',
      difficulty: 'hard',
      pseudocode: [
        'BEGIN',
        '  DECLARE year AS INTEGER',
        '  year = 2024',
        '  IF (year MOD 4 == 0 AND year MOD 100 != 0) OR year MOD 400 == 0 THEN',
        '    DISPLAY "Leap"',
        '  ELSE',
        '    DISPLAY "Not leap"',
        '  END IF',
        'END'
      ].join('\n'),
      python_code: 'year = 2024\nif (year % 4 == 0 and year % 100 != 0) or year % 400 == 0:\n    print("Leap")\nelse:\n    print("Not leap")'
    },
    {
      id: 'holdout_24',
      title: 'Repeat A String',
      concept: 'String repetition',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DISPLAY "ab" * 3',
        'END'
      ].join('\n'),
      python_code: 'print("ab" * 3)'
    },
    {
      id: 'holdout_25',
      title: 'Occurrences Of A Character',
      concept: 'Counting',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE text AS STRING',
        '  DECLARE ch AS CHARACTER',
        '  DECLARE hits AS INTEGER',
        '  DECLARE c AS CHARACTER',
        '  text = "banana"',
        '  ch = "a"',
        '  hits = 0',
        '  FOR EACH c IN text DO',
        '    IF c == ch THEN',
        '      hits = hits + 1',
        '    END IF',
        '  END FOR',
        '  DISPLAY hits',
        'END'
      ].join('\n'),
      python_code: 'text = "banana"\nch = "a"\nhits = 0\nfor c in text:\n    if c == ch:\n        hits = hits + 1\nprint(hits)'
    },
    {
      id: 'holdout_26',
      title: 'Sum Of Odd Numbers To Nineteen',
      concept: 'Stepped accumulation',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE s AS INTEGER',
        '  DECLARE k AS INTEGER',
        '  s = 0',
        '  FOR k FROM 1 TO 19 STEP 2 DO',
        '    s = s + k',
        '  END FOR',
        '  DISPLAY s',
        'END'
      ].join('\n'),
      python_code: 's = 0\nfor k in range(1, 19 + 1, 2):\n    s = s + k\nprint(s)'
    },
    {
      id: 'holdout_27',
      title: 'Swap Two Values',
      concept: 'Assignment',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE a AS INTEGER',
        '  DECLARE b AS INTEGER',
        '  DECLARE t AS INTEGER',
        '  a = 3',
        '  b = 9',
        '  t <- a',
        '  a <- b',
        '  b <- t',
        '  DISPLAY a',
        '  DISPLAY b',
        'END'
      ].join('\n'),
      python_code: 'a = 3\nb = 9\nt = a\na = b\nb = t\nprint(a)\nprint(b)'
    },
    {
      id: 'holdout_28',
      title: 'Factorial By Countdown Loop',
      concept: 'Accumulator',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DECLARE n AS INTEGER',
        '  DECLARE f AS INTEGER',
        '  n = 6',
        '  f = 1',
        '  WHILE n > 1 DO',
        '    f = f * n',
        '    n = n - 1',
        '  END WHILE',
        '  PRINT f',
        'END'
      ].join('\n'),
      python_code: 'n = 6\nf = 1\nwhile n > 1:\n    f = f * n\n    n = n - 1\nprint(f)'
    },
    {
      id: 'holdout_29',
      title: 'Palindrome Check',
      concept: 'String comparison',
      difficulty: 'medium',
      pseudocode: [
        'BEGIN',
        '  DECLARE word AS STRING',
        '  word = "level"',
        '  IF word == word[::-1] THEN',
        '    DISPLAY "yes"',
        '  ELSE',
        '    DISPLAY "no"',
        '  END IF',
        'END'
      ].join('\n'),
      python_code: 'word = "level"\nif word == word[::-1]:\n    print("yes")\nelse:\n    print("no")'
    },
    {
      id: 'holdout_30',
      title: 'Integer Quotient',
      concept: 'Floor division',
      difficulty: 'easy',
      pseudocode: [
        'BEGIN',
        '  DISPLAY 30 DIV 4',
        'END'
      ].join('\n'),
      python_code: 'print(30 // 4)'
    }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = CASES;
  if (root) root.SOP2_HOLDOUT_CASES = CASES;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
