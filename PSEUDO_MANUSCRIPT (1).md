

<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

**i COLLEGE OF COMPUTING STUDIES** Translating Pseudocode to Python: An Algorithmic Approach to Automated Code Generation A Thesis Proposal Submitted to the Faculty of The College of Computing Studies PAMANTASAN NG CABUYAO City of Cabuyao, Laguna In Partial Fulfillment of the Requirements for the Degree: BACHELOR OF SCIENCE IN COMPUTER SCIENCE By: Bautista, Mark Andrew S. Daet, Mikaella C. Mirandilla, Eduard John 

V. 

Reantaso, Marc Gian R. 

May 2026 

**ii** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF COMPUTING STUDIES**||
|---|---|
|TABLE OF CONTENTS||
|Title Page|i|
|Recommendation Letter|ii|
|Table of Contents|iii|
|List of Tables|v|
|List of Figures|vi|
|List of Appendices|ix|
|CHAPTER||
|I<br>THE PROBLEM AND ITS SETTING|Page|
|Introduction|1|
|Statement of the Problem|3|
|Scope and Limitation|4|
|Significance of the Study|5|
|II<br>REVIEW OF RELATED LITERATURE AND STUDI|ES|
|Conceptual Literature|7|
|Research Literature|10|
|Review of Related Literature|10|
|Difficulties of|11|
|Programmers|13|
|Pseudocode as a Pedagogical Tool|14|
|Automated Pseudocode-to- Code Generation|15|
|Review of Related Studies|19|



Competency-Based Assessment of 

**iii** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTINGSTUDIES**||
|---|---|---|
||Programming Skills in Higher Education|15|
||Block-Based<br>to<br>Text-Based|16|
||Programming Transition Tools||
||Automated  Feedback  Systems  in  Introductory|16|
||Programming Courses||
||Theoretical Background|17|
||Conceptual Framework|25|
||Synthesis|21|
||Definition of Terms|22|
|III|METHODS AND PROCEDURES||
||Research Design|25|
||Research Locale|25|
||Respondents of the Study|26|
||Data Gathering Procedure|27|
||Discussion<br>on<br>Algorithms/Mathematical|28|
||Concepts Used/Proposed Solution||
||System Development Methodology|36|
||Statistical Treatment of Data|45|
||Ethical Considerations|49|
|LITE|RATURE CITED|50|
|APP|ENDICES|52|



**iv** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**|
|---|---|
||LIST OF TABLES|
|Table|Page|
|1|Number of Respondents<br>28|
|2|Population of the Study<br>47|
|3|Five-Point Likert Scale Method<br>48|
|4|Evaluation Criteria<br>49|



LIST OF FIGURES 

**v** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**||
|---|---|---|
|Figure||Page|
|1|Theoretical Framework|20|
|2|The conceptual paradigm of the study|22|
|3|Agile Process Model|46|
|4|Use Case Diagram|47|
|5|Activity<br>Diagram for Pseudocode<br>to Python|48|
||Translation||
|6|Activity Diagram for Code Execution|49|
|7|Class Diagram for the Proposed System|50|
|8|Class Diagram|51|
|9|ER Diagram — Firestore Data Model|51|
|10|System Architecture Diagram|52|





<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**|**vi**|
|---|---|---|
||LIST OF APPENDICES||
||APPENDIX TITLE<br>Page||
|A|Confidentiality and Non- Disclosure<br>Agreement<br>78||
|B|Validated Research Instrument/s<br>81||
|C|Informed Consent Form<br>85||
|D|Research<br>Ethics<br>Review<br>Committee<br>89||
||Evaluation||
|E|Short Report of Plagiarism Software<br>100||
|F|Report of Language Software<br>104||
|G|Curriculum Vitae of Student Researchers<br>106||



**1** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **CHAPTER I** 

## **THE PROBLEM AND ITS SETTING** 

This study bridges the gap between logical thinking and executable Python code by designing and developing a hybrid pseudocode-to-Python code-generation system that addresses the common challenge of translating algorithmic reasoning into syntactically correct programs. This chapter lays the foundation for the study, outlining its purpose, scope, and beneficiaries. 

## **Introduction** 

In recent years, programming has become an important skill and ability not just in technology-related fields such as computer science and IT, but also in other fields such as business. With the development of digital tools, it is now possible for non-professionals to design software solutions. However, many students still find it difficult to understand programming despite its relevance. One of the biggest problems isn't grasping the reasoning of a problem, but translating that logic into code that works. Despite students might try to design solutions step by step, applying them in Python is not so easy, because of tight requirements of syntax and style [1], [2]. 

And this leads to an important point: the human problem-solving and the machine execution are separate processes. Traditional 

programming education typically involves writing code right away, so students must manage logic, grammar, and debugging at the same time. Therefore, students tend to 

**2** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

focus on addressing little problems like missing symbols or wrong indentation instead of building problem-solving skills. This can rapidly turn into confusion, distress and eventually a loss of motivation [3]. Pseudocode has been routinely utilized to fill this void. It provides a mechanism for pupils to convey ideas in an organized yet flexible manner, using basic language without the stress of restrictive syntax rules. 

Focusing first on logic before syntax helps students comprehend how solutions are constructed, making the learning process more manageable and less daunting [4]. However, translating pseudocode to real code still is a problem. Syntax, indentation and control structures are typically a challenge for students because it is hard to know if problems are due to faulty logic or bad implementation. This hinders the progression and impacts the entire learning experience [5]. As technology advances, many automated code generation approaches have been developed, such as rule-based systems and artificial intelligence models [6], [4]. 

These programs can create code efficiently, but many are not meant for instructional use. They are generally black boxes and do not provide enough guidance to learners on how the code is generated. In order to overcome these issues, the research advocates the creation of a hybrid pseudocode to Python code generator. The system facilitates learning through rule-based translation, execution-based validation and adaptive feedback. It teaches students how to structure pseudocode and check the output, with the purpose of reducing coding errors, enhancing 

program accuracy and strengthening the relationship between logical thought and actual code. The eventual goal of the system is to provide a more structured and effective learning experience for the beginner 

**3** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

**COLLEGE OF COMPUTING STUDIES** 

coder. 

## **Statement of the Problem** 

This study bridges the gap between algorithmic reasoning and executable programming syntax by designing and developing a hybrid pseudocode-to-Python code generation system. The system utilizes a rule-based translation approach supported by Context-Free Grammar (CFG) and Syntax-Directed Translation (SDT), combined with validation mechanisms to improve the correctness of generated programs. 

Specifically, the study seeks to answer the following questions: 

1. How does the application of Syntax-Directed Translation (SDT) influence the translation outcome of the Context-Free Grammar (CFG) in generating syntactically correct and executable Python code? 

2. How does the mapping model with a validation mechanism in the PseudoPy system improve the code generation compared to the traditional pseudocode-to-code methods in terms of: 

   - a) percentage improvement in code generation correctness; 

   - b) reduction in syntax and runtime errors; and 

c) faster code generation time? 

3. How does the hybrid model and transformation logic of algorithms in the PseudoPy system convert pseudocode into Python code, in 

## terms of: 

a) code generation accuracy; 

**4** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**|
|---|---|
|b)|syntactic correctness;|
|c)|semantic correctness;|
|d)|execution success rate; and|
|e)|generation time?|
|4.<br>How c<br>transl|an performance in automated pseudocode-to-code<br>ation be evaluated using measurable metrics such as:|
|a)|accuracy;|
|b)|precision;|
|c)|compilation success rate;|
|d)|execution time; and|
|e)|runtime error rate?|
|5. What<br>the sy|are the assessments of students and instructors regarding<br>stem in terms of:|
|a)|usability;|
|b)|learnability;|
|c)|efficiency; and|
|d)|reliability?|
|6. What i<br>expert|s the level of evaluation of the proposed application by IT<br>s based on the ISO 25010 quality criteria in terms of|
|a)|functional suitability ;|



b) usability ; 

**5** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**|
|---|---|
|c)|reliability;|
|d)|performance efficiency;|
|e)|maintainability ; and|
|f)|portability ?|



## **Scope and Limitation** 

PseudoPy (Pseudocode-to-Python) is created as an automated logic interpretation using a rule-based mapping model using transformer for educational tools, especially for academic environments. The intended users of this study are Computer Science students who learn logic formulation, instructors who need to evaluate student’s progress and automate solution keys, and researchers who analyze the efficiency of rule-based translation. The system is geographically planned to be deployed locally in university laboratories and personal student devices, as a Progressive Web Application to be accessible in locations with a lack of continuous internet connection. The development and evaluation were carried out during the Academic Year 20252026, and the main goal was to connect the gap between abstract logic and syntax-heavy programming via a **dynamic interpretation environment** providing rapid instructional feedback. Some of the key features include **integrated logic to execution pipeline,** intelligent keyword suggestions based on Levenshtein Distance algorithm, multi-role dashboard for students and administrators, learning analytics to track concept mastery and local code execution using Skulpt interpreter. 

The system consists of several integrated modules providing some functionality. **The Processing and Execution Engine** is the main module that 

handles lexical analysis, syntax parsing with recursive descent, semantic validation, and p **reparing the logic for interpretation by real-time Python.** The Metrics Engine 

**6** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

is a formal evaluation module that computes accuracy, precision, recall and F1score against a ground-truth dataset. The UI and Dashboard Module provides the responsive interface and role-based access management for user interaction. The Data Management Module provides offline persistence via localStorage and contains the benchmark test cases. 

The system allows offline operation and three modalities of pseudocode input for immediate conversion and execution. The offline feature system can run completely offline by moving Logic to be processed on the Client (browser), Data saved in LocalStorage, Runtime uses Skulpt (JS based on Python), Access uses Service Worker Cache from a remote server to the local device of the user. In PseudoPy this is achieved by a combination of Progressive Web App (PWA) technologies, client-side interpretation and local data persistence. 

The system also provides dynamic offline feedback through Static Program Analysis (SPA) by analyzing the Abstract Syntax Tree (AST) and Symbol Table instead of relying on hard-coded keywords. It performs syntactic, semantic, algorithmic, and logical analysis to detect structural errors, undeclared variables, inefficient algorithms, and differences between student solutions and instructor-defined logic. This enables PseudoPy to generate intelligent and context-aware feedback entirely within the browser environment. 

The PseudoPy system functions as an offline-first **Progressive Web App (PWA)** that eliminates the need for a constant internet connection by utilizing a **4-stage compiler pipeline** and a **local storage database** built directly into the browser. In a classroom setting, the system acts as a self-contained learning environment where instructors can manage exercises through a central dashboard, and students can solve logic problems with the help of a **dynamic refinement loop** that provides real-time, non-hard-coded feedback. Because the system leverages client-side libraries like **Skulpt** for Python 

execution and a **rule-based mapping model** to translate natural language into structured logic, it can be distributed as a simple web link or a portable folder, allowing students to access, solve, 

**7** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

and track their algorithmic progress entirely on their own devices without ever needing a back-end server. 

The system provides a different file inputs, first is Manual Input, where students or instructors key in pseudocode directly into the system interface. The system can verify student logic against teacher reference solution and automatically grade the algorithm reliability using AST and EMA. The second is File-Based Input, which allows pseudocode to be submitted through uploaded documents in formats such as PDF, TXT, DOCX, and other appropriate file types. This feature allows students and teachers to **run and test logic** without requiring direct interaction with the system's text editor. The third is SystemProvided Example Files where the system provides pre-built pseudocode templates and guided examples as educational references to show the correct structure and syntax of pseudocode to help students learn the required **logic patterns before execution.** 

However, the system has some limits beyond of the researcher's control despite its robust design. To guarantee 100% predictability and to prevent the hallucination problems that are typical in black-box AI models, the system is limited to a pre-defined vocabulary of keywords. Additionally, **the system depends on client-side interpretation using Skulpt** , which may lead to worse performance compared to native settings because of the virtualization overhead needed for offline functionality. Finally, the system is logic-centric and does not support complicated Python libraries, file I/O, OOP, and complex Data Structures. The primary focus is on understanding core logic and control structures from the conventional computer science curriculum. 

**Significance of the Study** 

This research is to present a method called “Translating Pseudocode and Python: An Algorithmic Approach to Automated Code Generation” which allows the systematic conversion of pseudocode generated by students into working Python 

**8** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

code. The method is intended to improve learner's algorithmic thinking, logical reasoning and comprehension of programming foundations. This research was done by the researchers and they intend to be helpful to the following: 

**Students** - The system improves the learning experience by reducing the need to memorize strict syntax rules and instead focusing on logical thinking and algorithmic understanding. The mapping model helps interpret different natural language variations into standardized programming commands, which reduces confusion and cognitive load during coding. Students benefit from improved code correctness through dynamic feedback, fewer syntax and runtime errors due to early detection and autocorrection, and faster learning cycles because the system reduces repetitive trial-and-error debugging. Over time, this leads to measurable improvement in coding performance within a single learning session as errors decrease and successful outputs increase. **Educators -** the system provides a more intelligent way to observe and understand student learning behavior. To identify track and progress of the student more accurately, it is design more targeted instructional strategies based on actual student performance data rather than just final outputs. It shifts the teaching approach toward a more adaptive and data-driven model of instruction. 

**Researchers** – the study contributes a hybrid framework that combines classical compiler design principles with modern natural language processing concepts. It demonstrates how lexical analysis, parsing, autocorrection, and syntax-directed translation can be integrated with a mapping model to improve educational programming systems. The system also provides empirical data through learning analytics, enabling further exploration of how semantic mapping reduces cognitive load and improves code comprehension and correctness. This makes the framework a useful reference for studies related to 

intelligent tutoring systems and programming education tools. **Future Researchers – T** he system serves as a scalable foundation that can be expanded with more advanced technologies such as machine learningbased 

**9** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

semantic parsing or transformer-based language models. It also opens opportunities for extending the system into multi-language code generation and deeper adaptive learning analytics that can further personalize programming education. The modular structure ensures that each component can be enhanced independently while still maintaining system coherence. 

**Software Engineering and Tool Development** - the study demonstrates the effectiveness of combining multiple lightweight algorithms into a single educational compiler pipeline. The mapping model, implemented as a fast pattern-matching pre-processor, ensures minimal computational overhead while improving overall system efficiency. By reducing debugging cycles, minimizing errors before execution, and accelerating the transition from pseudocode to executable Python code, the system achieves improved development efficiency and faster generation time. Ultimately, the study contributes a system that not only compiles code but also actively supports learning by interpreting intent, guiding correction, and measuring improvement in a structured and meaningful way. 

**10** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **CHAPTER II** 

### **REVIEW OF RELATED LITERATURE AND STUDIES** 

This chapter builds the intellectual groundwork for the study. It walks through existing literature directly relevant to the research, traces the theoretical foundations the study draws from, and maps out the conceptual framework that holds everything together. It also pulls together a synthesis of what prior work has already established and closes with key terms defined in the context in which they are actually used here. 

### **Conceptual Literature** 

### **Standard Features** 

The whole point of converting pseudocode to Python is not to make students write code from scratch; it is to meet them where they already are. Students can already think through a problem algorithmically; what trips them up is the moment syntax enters the picture. Traditional programming instruction tends to drop beginners straight into that syntax-heavy environment, which pulls attention away from the actual thinking and toward mechanical rulefollowing. A pseudocode-based learning system sidesteps that friction entirely by letting students first express solutions in a structured yet natural way. It gives them a cleaner path toward genuinely understanding how programming logic works, rather than just memorizing how it looks. [4] 

A well-designed pseudocode-to-Python conversion system is not just a translator — it is a full learning environment, and the features it includes should 

reflect that. At the center is a split-panel code editor: pseudocode on one side, generated Python on the other, both updating in real time. That side-by-side view is not just 

**11** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

convenient, it makes the relationship between logic and code immediately visible, which is exactly the kind of feedback a beginner needs. Alongside that, the system should let students run the generated Python code and see its output on the spot, no installations, no setup, no friction. 

Beyond the core editor, the system carries a few features that push it from useful to genuinely practical. Students should be able to download the works as an actual .py file, something they can keep, build on, and submit. There should also be an automated feedback tool that does not just flag errors, but explains them, catching structural issues like missing BEGIN or END markers, unbalanced control structures, and absent output statements, then offering a quality rating and concrete suggestions for improvement. 

On the instructor side, an exercise management module would let teachers create, edit, and assign programming tasks across difficulty levels, with or without attached solution keys. Moreover, tying it all together, rolebased access control ensures that students, teachers, and administrators each interact only with the parts of the system relevant to them [3]. 

### **Guidelines for Using the Algorithms** 

The translation algorithm used in pseudocode-to-Python systems relies on a set of predefined rules that determine how each pseudocode statement is converted into its Python equivalent. The algorithm reads pseudocode one line at a time and matches each line against recognized patterns. Each statement must follow a specific structure for example, variable assignment must use the keyword SET followed by the variable name and the keyword TO, conditional statements must begin with IF and end with END IF, and loops must use FOR or WHILE with a closing END FOR or END WHILE. 

**12** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

The algorithm also manages indentation automatically, increasing the indent level when entering a block and decreasing it when the block is closed. This is essential because Python uses indentation to define the scope of code. Operators such as AND, OR, NOT, and MOD are translated into Python equivalents, and 12oolean values like TRUE and FALSE are converted to True and False. If a line does not match any recognized pattern, the algorithm converts it into a comment rather than producing an error, so the remaining translated code stays intact. These guidelines ensure that students who follow the correct pseudocode structure will receive accurate and executable Python output [2]. 

There are several important things that is consider when developing this type of application. The translation algorithm is carefully designed to handle a wide variety of pseudocode constructs, including variable declarations, nested control structures, function definitions, and logical expressions. Proper indentation tracking is critical since Python depends on whitespace to define code blocks. The system also handle unexpected input gracefully converting unrecognized lines into comments rather than crashing or producing broken code. 

The choice of database technology matters as well; using a local host database allows real-time data access for storing user accounts, exercises, and student activity records without requiring a dedicated server. Developers also consider data security, particularly regarding how passwords and credentials are stored. Building the platform as a Progressive Web Application ensures it can be accessed across different devices and even installed as a standalone app, which improves accessibility for students who rely on mobile devices. Performance and reliability of the in-browser code execution engine must also 

be tested thoroughly, and a fallback mechanism should be in place in case the execution library fails to load [4]. 

### **User-Centric Design** 

**13** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

User-centric design plays a vital role in ensuring that the system meets the needs of its intended users effectively. The interface should be intuitive and visually organized so that students can focus on learning rather than struggling to navigate the platform. Clear labeling of buttons and sections, logical page layouts, responsive design for different screen sizes, and immediate visual feedback such as success notifications when code is translated or error alerts when execution fails all contribute to a smoother and more engaging user experience [5]. 

### **Testing Tools and Procedure** 

Testing is equally important; usability testing with actual students and instructors helps identify confusing workflows and missing features that may not be obvious during development. Functional testing verifies that all features including translation, execution, exercise management, and user administration work correctly across different scenarios and edge cases. By combining user-centric design principles with thorough testing practices, developers can build a system that is not only technically functional but also genuinely effective as a learning tool for students at different skill levels [5]. 

### **Research Literature** 

### **Review of Related Literature** 

The purpose of this chapter is to examine how previous studies and technologies address similar problems, identify research gaps, and establish the importance of the current study in relation to existing work. Additionally, this chapter provides the conceptual foundation and supporting guidelines that will help shape the development of the proposed solution. 

**14** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **Difficulties of Programmers** 

The field of programming and software development continues to evolve, especially with the integration of artificial intelligence and Natural Language Processing (NLP). Today, it is important for students to understand the logic and step-by-step process of solving problems before translating them into actual code. Pseudocode plays a key role in this process, as it allows learners to express algorithms using simple, human-readable language. 

Related studies show that NLP and machine learning can be used to process textual data and convert it into meaningful outputs such as code. This highlights the growing potential of automated systems in simplifying programming tasks, particularly for beginners who are still developing logical and coding skills. 

One of the main challenges in programming education is the difficulty students face in translating pseudocode into actual programming languages like Python. Since pseudocode is not standardized and is often written in natural language, it becomes hard to interpret and convert into executable code. This gap between understanding logic and writing code can slow down the learning process. 

Additionally, beginners often struggle with syntax, structure, and proper implementation of programming concepts. Even if they understand the algorithm, they may not know how to express it correctly in a programming language. This creates a need for tools or systems that can assist in bridging the gap between logical thinking and code implementation. 

And in some cases programmers struggle not primarily due to syntax errors, but because they cannot clearly visualize how algorithms operate or 

translate them into correct program structures. Research indicates that beginners often fail to properly sequence steps, apply control structures appropriately, or anticipate program flow, resulting in flawed logic and nonworking programs even when syntax is correct [1]. 

**15** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

These challenges are frequently described as weaknesses in algorithmic thinking, wherein students have difficulty decomposing problems, designing step-by-step solutions, and mapping those solutions into executable structures [2]. 

Identified several contributing factors to these outcomes, including ineffective instructional strategies, students’ prior misconceptions, and the inherently abstract nature of programming concepts. Butler and Morgan [2], [3] emphasized that conceptual and strategic knowledge—such as understanding program design, control flow, and the interaction between programming constructs—poses greater difficulty for novices than mastering syntactic rules. They further observed that students often receive detailed feedback on syntax errors but limited guidance on higher-level logical reasoning, thereby reinforcing shallow learning focused on code details rather than overall algorithm structure [3]. 

Van Merriënboer and Sweller [4] extended this perspective through cognitive load theory, arguing that novices’ working memory becomes overloaded when required to simultaneously manage syntax, logic, and problem decomposition. 

Algorithmic thinking is widely recognized as a foundational skill in programming education [5]. When students lack this foundation, they encounter difficulties converting informal problem descriptions into structured algorithms and ultimately into working code [1], [5]. To address these issues, researchers have proposed various pedagogical models and technological interventions, including structured problem-solving frameworks, visualization tools, and educational programming environments that promote stepwise refinement and repeated algorithm design practice [5], [6]. However, Butler and 

Morgan [6] cautioned that technology alone is insufficient to resolve these learning challenges without corresponding improvements in instructional methods and curriculum design. 

**16** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **Pseudocode as a Pedagogical Tool** 

Pseudocode is commonly used in computer science education as a language-independent method for expressing algorithms, allowing students to focus on logical structure rather than strict syntax [1]. By minimizing languagespecific constraints, pseudocode enables learners to concentrate on problem decomposition, control structures, and data flow [4]. Acharjee [4] argues that algorithmic thinking taught through pseudocode creates cognitive scaffolding that transfers across programming languages and paradigms. 

Olsen [8] described a teaching approach in which students first learn to write pseudocode from problem statements and later convert it into source code, resulting in improved pseudocode quality and deeper understanding of computational concepts. In a qualitative analysis of student work, Olsen [8] observed that pseudocode-first instruction helped learners internalize structural patterns before confronting language-specific syntax requirements. 

Despite these benefits, transitioning from pseudocode to executable code remains challenging for many novices [1]. The manual process of mapping pseudocode constructs into language-specific syntax can be time-consuming and error-prone, particularly in languages such as Python that impose strict indentation rules and precise syntactic forms for control structures [9], [10]. Practical guides emphasize that although pseudocode may clearly express logical intent, the translation step introduces opportunities for syntactic errors that may obscure whether the underlying algorithm is correct [9]. Similarly, common beginner mistakes during translation include incorrect loop boundary implementation and improper conditional nesting [10]. 

Some researchers argue that while pseudocode promotes conceptual clarity, students require structured scaffolding during translation to actual code to prevent 

**17** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

reliance on trial-and-error practices that weaken algorithmic reasoning [6], [10]. For inexperienced programmers, identifying and correcting logical flaws—also referred to as semantic errors—can be particularly frustrating. Improving instructional methods by identifying prevalent and challenging logical errors may reduce student frustration and enhance learning outcomes. 

To address these challenges, educators have proposed integrating tools that directly link pseudocode and executable code, enabling students to visualize the correspondence between algorithmic steps and actual program statements [5], [11]. The BBC Open Source pseudocode parser project [11] demonstrates an institutional approach to automating translation while providing immediate feedback and reinforcing proper control flow patterns. Such systems can assist learners in verifying whether the intended algorithmic logic is accurately reflected in the resulting executable code. 

### **Automated Pseudocode-to-Code Generation** 

Recent studies in programming education explore automated translation between pseudocode and source code to improve program comprehension. One approach focuses on generating pseudocode from source code to help developers understand program logic. For instance, Oda et al. [8] used statistical machine translation to automatically generate pseudocode summaries from source code, which can assist in explaining large codebases in a language-independent way. 

Other studies examine the reverse process, where pseudocode is translated into executable code. Xu et al. [9] proposed an improved model for pseudocode-to-code conversion that balances both efficiency and generation 

quality. Zhong, Stern, and Klein [10] also introduced the concept of semantic scaffolds, which use 

**18** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

intermediate structural representations to guide the code generation process and improve syntactic accuracy. 

Additionally, search-based systems such as SpoC [11] refine generated programs by exploring alternative code candidates and validating them through test cases. This approach significantly improves the success rate of pseudocode-to-code synthesis and is particularly useful in educational settings where students may need multiple iterations to correct logical errors. 

### **Review of Related Studies** 

### **Competency-Based Assessment of Programming Skills in Higher Education** 

Luxton-Reilly et al. [32] conducted a systematic review of introductory programming literature spanning over 15 years, examining trends in how students learn to program across four areas: the student, teaching, curriculum, and assessment. The review found that traditional assessments tend to measure students’ ability to write syntactically correct code rather than deeper capacity for algorithmic reasoning and problem decomposition. The authors highlighted that novice programmers frequently struggle not with syntax rules alone, but with higher-order skills such as code tracing, debugging, and algorithm design — competencies that standard exam formats often fail to capture. The review further noted the growing need for tools and instructional approaches that explicitly target algorithmic thinking rather than relying on code correctness as the primary measure of learning. This is directly relevant to the current study, as the proposed pseudocode-to-Python system addresses precisely this gap — by requiring students to design algorithmic logic in 

pseudocode before any syntax is involved, it shifts the focus from surface-level code production to genuine problem-solving competency. 

**19** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

### **Block-Based to Text-Based Programming Transition Tools** 

Weintrop and Wilensky [33] examined the experiences of high school students transitioning from block-based programming environments such as Scratch to text-based languages such as Python. Using a mixed-methods design with 120 students across three schools, the researchers compared three transition approaches: direct switching with no scaffolding, teacher-mediated scaffolding, and a hybrid block-text editor that displayed both representations simultaneously. Findings revealed that students using the hybrid tool demonstrated a 31% lower rate of syntax errors in first text-based projects and reported significantly higher confidence scores on post-surveys. Qualitative interviews indicated that seeing the visual block representation alongside the text equivalent helped students construct a mental bridge between visual logic and formal code syntax. The study concluded that transition tools that make the correspondence between visual or informal representations and formal code explicit are more effective than abrupt switches or verbal instruction alone. The relevance of this study to the current research is direct: the pseudocode-toPython system proposed here operates on an analogous bridging principle. Just as the hybrid block-text editor allowed students to see both representations simultaneously, the proposed system shows students the given pseudocode alongside the generated Python translation, making the mapping between algorithmic intent and syntactic form visible. Weintrop and Wilensky’s findings support the hypothesis that this kind of side-by-side correspondence display reduces errors and builds conceptual confidence in novice programmers. 

### **Automated Feedback Systems in Introductory Programming Courses** 

Keuning, Jeuring, and Heeren [34] conducted a systematic evaluation of automated feedback tools deployed in introductory programming courses 

across seven European universities, covering over 2,400 students and 18 distinct tools. The study analyzed the types of feedback provided (syntactic, semantic, and conceptual), the frequency of student interaction with feedback, and the correlation between 

**20** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

feedback engagement and final course performance. Results demonstrated that tools providing multi-level feedback — covering not only syntax errors but also logical structure and algorithm quality — were associated with a 22% improvement in assignment completion rates and a 17% improvement in exam performance compared to tools providing only syntax-level feedback. The researchers also found that feedback which guided students toward understanding why an error occurred, rather than simply identifying what was wrong, led to significantly fewer repeated errors in subsequent tasks. The study recommended that future automated programming tools move beyond error detection toward explanatory and generative feedback that supports deeper algorithmic reasoning. This study directly informs the design rationale of the proposed system. The finding that multi-level, explanatory feedback outperforms syntax-only correction aligns with the system’s design goal of helping students observe execution output, compare it with expected results, and iteratively refine the pseudocode. The proposed system’s process of translation-execution-comparison operationalizes the type of reasoningoriented feedback that Keuning et al. identified as most effective for novice programmers [34] 

## **Theoretical Background** 

This study is anchored on three primary theoretical foundations: Constructivism, Cognitive Load Theory, and Syntax-Directed Translation. These theories provide the framework for understanding how students learn programming and how the proposed pseudocode-to-Python translation system supports that learning process. 

**21** 



<!-- Start of picture text -->
A ia hh<br>omar<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Design of Pseudocode-to-Python<br>Conversion System<br>Pseudocode Authoring Environment<br>Automated Validation & Translation<br>(‘SDT/CFG Engine’<br>Execution, Feedback, & Performance Logging<br>Improved Algorithmic Thinking and Programming Performance of Students<br><!-- End of picture text -->

## Figure 1. Theoretical Framework. 

### **Constructivism** 

Constructivism, initially developed by Piaget and later expanded by Vygotsky, posits that learners actively construct knowledge by integrating new experiences with prior understanding rather than passively receiving information [1], [2], [4]. In programming education, this implies that students develop algorithmic thinking by designing pseudocode, predicting program behavior, and reflecting on execution outcomes instead of merely memorizing syntax rules [5], [19]. Constructivist learning environments emphasize learner control, experimentation, and reflection, allowing students to refine mental models through iterative practice and feedback [1], [3]. The proposed Pseudocode-to-Python system operationalizes constructivist principles by providing an interactive workspace where students is the author of the pseudocode, translate it to Python, and immediately observe the resulting program behavior. By iteratively revising pseudocode in response to execution and error feedback, learners engage in cycles of experimentation and reflection 

that support deep conceptual understanding rather than rote syntax recall [18], [31]. 

**22** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

### **Cognitive Load Theory** 

Cognitive Load Theory (CLT), introduced by Sweller, states that human working memory has limited capacity and that learning is enhanced when extraneous cognitive load is minimized so that more resources can be devoted to essential processing [6], [7]. CLT distinguishes intrinsic load (complexity inherent to the material), extraneous load (imposed by presentation and interface design), and germane load (effort invested in schema construction and automation) [6], [8]. Research in programming education shows that novice programmers often experience high extraneous load because they must simultaneously manage problem analysis, algorithm design, programming language syntax, and debugging activities [11], [7]. This overload can hinder the development of robust mental models for core programming concepts [18], [31]. The proposed system aims to reduce extraneous load by automating the syntactic translation from structured pseudocode to Python. By allowing students to focus on expressing algorithms in constrained pseudocode while the tool handles boilerplate syntax and formatting, more cognitive resources can be allocated to intrinsic aspects such as control structures, data flow, and problem decomposition [18]. The dual visualization of pseudocode and generated Python, together with immediate feedback on execution and errors, is expected to foster germane load by supporting schema formation for basic programming patterns [6], [31]. 

### **Syntax-Directed Translation and Context-Free Grammar** 

In SDT, attributes are associated with grammar symbols, and semantic rules specify how these attributes are computed during parsing, enabling systematic conversion from source constructs to target code [28], [14]. CFGs 

provide a formal model for defining the syntactic structure of programming languages, allowing parsers to construct abstract syntax trees that capture the hierarchical organization of control 

**23** 



<!-- Start of picture text -->
f fA ¥<br>ome)<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

statements, expressions, and declarations [28], [14]. The proposed Pseudocodeto-Python system adopts a CFG-based SDT scheme to ensure that studentwritten pseudocode is syntactically valid before translation. The lexer first tokenizes the input, and the parser then attempts to derive the token sequence from the start symbol using predefined production rules. When a valid parse tree is constructed, attached semantic actions generate equivalent Python constructs with correct indentation and structure. This formalization guarantees that each pseudocode pattern (e.g., conditional, loop, function-like block) is mapped to a predictable Python template, enabling consistent translation and reliable automated feedback on syntax errors [16], [28], [14]. 

## Process **Conceptual Framework** 

. **Figure 2. Conceptual Framework of the Proposed System** 

The framework of this study bridges the gap between algorithmic thinking and executable Python code by integrating **Cognitive Load Theory** and **Constructivism** 

**24** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

on the pedagogical side, and **Context-Free Grammar (CFG)** and **SyntaxDirected Translation (SDT)** on the technical side. At the input stage, students submit structured pseudocode through a split-panel editor—an approach rooted in Cognitive Load Theory that reduces the mental burden of syntax memorization and allows learners to focus on logical reasoning. Constructivism further supports this stage by treating pseudocode writing as an active knowledge-building process, with instructors providing structured exercises that scaffold learners' progression toward programming proficiency. 

At the process and output stages, CFG governs pseudocode validation via Lexical Analysis and AST-based parsing, ensuring that all input is structurally sound before translation begins. SDT then drives the actual conversion in Python by embedding semantic actions directly into the grammar rules, handling Python's strict indentation and block-structure requirements throughout the derivation tree. The system further refines its output through execution-based validation and Levenshtein distance mapping, ultimately producing validated Python code, a quality score, and instructor activity logs. Together, these four foundations ensure that the system functions not only as a technically rigorous translation engine but also as a pedagogically meaningful tool that supports beginner programmers in bridging the gap between logical thinking and correct coding. 

## **Synthesis** 

The study intends to use a rule-based translation algorithm and contextfree grammar to apply systematic pseudocode-to-Python conversion for both writing and executing code, giving students a more structured and guided learning procedure. The study will use a syntax-directed translation approach as its conversion strategy, where the generated Python code will be precisely 

mapped from the student's pseudocode constructs, ensuring that the logical intent of the student is accurately reflected in the executable output. To support deeper algorithmic thinking and reduce cognitive 

**25** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

burden, the study seeks to automate syntax handling and indentation management so that students can focus to mental effort entirely on problemsolving and algorithm design. The researchers constructed a conceptual framework that is supported by a theoretical foundation to serve as the guide for the study's development and implementation. The theoretical background provides the basis for understanding how students learn programming, particularly through the lens of Constructivism, Cognitive Load Theory, and Syntax-Directed Translation. At the same time, the conceptual framework identifies the system's key inputs, processes, and outputs. Compared to traditional instruction where students must manually translate pseudocode into Python, the proposed system offers a more efficient and scaffolded learning experience, allowing students to observe algorithmic logic become executable code while receiving immediate feedback that reinforces understanding of programming concepts. 

## **Definition of Terms** 

This section provides clear definitions of important words and concepts used throughout this study to avoid ambiguity and improve the clarity and accuracy of the discussion. These are separated between operational and conceptual terms to ensure readers share a common understanding of the terms as used in this study, which may differ from general or dictionary meanings. 

## **Technical Terms** 

**Terms Definition** Conceptual The basic principles, theories, and core Foundation ideas that support understanding and 

learning in a particular  field,  such  as programming concepts and logic [1]. 

**26** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF C**|**OMPUTING STUDIES**|
|---|---|
|Built-in Methods|Predefined<br>functions<br>provided<br>by<br>a|
||programming language that perform<br>common operations<br>without<br>requiring manual<br>implementation [23].|
|Functions|Reusable blocks of code designed to<br>perform a specific task, which can accept<br>inputs and|
||return outputs [5].|
|Large Language Model (LLM)|A neural network-based model trained on<br>vast text corpora that can generate,|
||understand, and  manipu-  late  human|
||language  and|
||code[15].<br>i|
|Syntax|The set of rules that defines the structure<br>and arrangement of symbols and|
||statements in a|
|Variables|programming language [1].<br>Named storage locations in a program<br>that hold data values which can be changed<br>during|
||program execution [5].|
|**Operational Terms**||
|**Terms**|**Definition**|
|Compiler|The proposed system functions similarly|
||to a compiler by taking pseudocode as<br>input and translating it into Python|



code. However, unlike traditional compilers that target machine code, this system targets a 

high-level language while applying compiler 

**27** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF**|**COMPUTING STUDIES**<br>techniques such as lexical analysis<br>and<br>parsing [8].|
|---|---|
|Automation|Describes the mechanisms lexical|
||analysis, parsing, translation and what|
||the system does<br>for<br>users|
||automatically  converts,<br>provides feedback[2].|
|Context-Free Grammar (CFG)|CFGs provide the theoretical foundation|
||for parsing pseudocode and defining|
||valid<br>algorithmic<br>structures<br>before|
||<br>translation [1]. The system implements a<br>CFG specifically designed for educational<br>|
||pseudocode, ensuring that only|
||syntactically<br>correct<br>inputs<br>are|
||processed and translated [3], [6].|
|Pseudocode|Pseudocode functions as the primary<br>input format for users of the system.<br>Students write the algorithmic solutions<br>using simple, structured language that<br>resembles but is simpler than actual|
||programming code. The system then|
||processes this pseudocode to generate<br>executable Python programs [26].|
|Python|Python serves as the target output|
||language of the translation system.|
||When users input pseudocode, the|
||system generates equivalent Python|
||code that can be executed to verify|



algorithmic correctness. Python is chosen due to its syntax similarity to pseudocode and its 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF C**|**OMPUTING STUDIES**|**28**|
|---|---|---|
||extensive built-in methods that<br>simplify<br>translation [22].||
|Syntax-Directed Translation (SDT)|Syntax-Directed Translation (SDT) is a<br>compiler design approach in which||
||semantic actions are attached to||
||grammar<br>productions<br>so<br>that||
||translation is driven by the structure of||
||a Context-Free Grammar<br>(CFG) [28].||



**29** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **CHAPTER III** 

## **RESEARCH METHODOLOGY** 

This chapter presents the methodological framework of the study, outlining the research design, locale, and participants. It further describes the procedure for algorithm development, the instruments used for data collection, their validity and reliability, the scoring and interpretation of responses, and the ethical considerations observed throughout the conduct of the research. 

### **Research Design** 

This study is anchored on a quantitative research design, employing structured online surveys as the primary instrument for numerical data collection. The investigation focuses on three key areas: first, the system's proficiency in translating structured pseudocode into executable Python code through the application of rule-based algorithms, Context-Free Grammar, and Syntax-Directed Translation; second, the effectiveness of the validation mechanism in ensuring code correctness through execution-based checking and iterative refinement; and third, the system's capacity for performance improvement over time by drawing from previously validated translations. Syntax accuracy, execution success rate, and logical correctness serve as the primary performance metrics. Feedback from students and instructors is also collected to evaluate the system in terms of usability, learnability, efficiency, and reliability. The resulting data are analyzed using frequency counts, percentages, and weighted means. 

**Research Locale** 

The study will be conducted at the University of Cabuyao also known as Pamantasan ng Cabuyao located in Katapatan Mutual Homes Barangay Banaybanay 

**30** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

in the City of Cabuyao, Laguna. We chose this university on purpose because it fits to the goal of the study. In the the College of Computing Studies the Python language is already known language of the students, it is also part of the advanced computing subjects in different field, especially for third-year students in both Bachelor of Science in Computer Science and Bachelor of Science in Information Technology programs. These students are required to learn the Python language to solve increasingly complex problems as they progress at the same time to learn new language. And for this  reason, University  of  Cabuyao  serves  as  an  setting  for  this  study. 

### **Respondents of the Study** 

Third-year BSCS and BSIT students at the University of Cabuyao serve as the respondents. Each program will contribute at least 30 students, for a combined target sample of 60 to 100. This sample range is considered sufficient to produce dependable evaluation results without exceeding manageable limits. 

The foundational concepts, such as pseudocode writing and algorithmic thinking, equip them with the prerequisite knowledge to engage substantively with the system. However, the selection of third-year students was purposive and carefully considered based on the required skills of the students. At this stage of their academic journey, students have typically been exposed to problem-solving logic, but some continue to struggle to express that logic in Python syntax. That's the challenge the system is trying to address and improve. This combination of prior knowledge and existing learning needs makes third-year BSCS and BSIT students the most suitable participants for this study. 

Researchers will utilize purposive sampling to define the sample size of the study. Purposive sampling represents a non-probability sampling technique that selects participants through specified characteristics or expertise related to their research objectives [44]. 

**31** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|**Category**|**No. of Respondents**|
|---|---|
|3<sup>rd</sup>Year Computer Science Student|30|
|3<sup>rd</sup>Year Information Technology Student|30|
|IT Experts|6|
|Total|66|



Table 1. Number of Respondents. 

### **Data Gathering Procedures** 

The data collection for this study will be carried out in three stages: predata gathering, actual data gathering, and post-data gathering. **Pre-Data Gathering Phase** . Before anything else, the researcher needs to secure the proper permissions to push through with the study. A formal request letter, signed off by the research adviser, will be sent to the Dean of the College of Computing Studies at the University of Cabuyao. Once the Dean gives the green light, the researcher will ask for the official enrollment list of third-year BSCS and BSIT students — this is needed to figure out the right population and sample size. At the same time, the survey instrument will be reviewed by computing experts to check whether it actually measures what it’s supposed to measure, making sure it’s ready before it reaches the respondents. **Actual Data Gathering Phase** . With the validated instrument in hand, the researcher will roll out the survey to the chosen third-year students. Whether through Google Forms or printed copies, the survey will be given at a time that works best for the respondents so the regular class schedules aren’t disturbed. Before anyone fills out a single question, they’ll be handed an Informed Consent form explaining what the study is about and making it clear that joining is entirely up 

to them — no pressure whatsoever. **Post-Data Gathering Phase** . Once the collection period wraps up, all responses will be gathered, tallied, and encoded for processing. In keeping with the 

**32** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Data Privacy Act of 2012 (R.A. 10173), any personal information collected will be handled with strict confidentiality — stored safely and used only for this academic study. From there, the compiled data will move on to statistical treatment, analysis, and interpretation. 

### **Instrumentation** 

The main tool for collecting data in this study is a researcher-made questionnaire distributed through Google Forms, a straightforward and accessible platform that makes it easy to reach respondents online. A paperbased survey is also prepared as a backup option for those who may have trouble with digital access. 

The questionnaire is designed to pull together three key types of information: how accurate the system’s generated Python code is, how well the system performs overall, and what students and instructors actually think about using it. 

As for who fills it out, respondents were chosen through simple random sampling from the pool of third-year BSCS and BSIT students at the University of Cabuyao — giving every eligible student a fair and equal shot at being selected. 

### **Validation** 

After the data analysis has categorized the data gathered, it will undergo external validation to ensure the accurate measurement of the instrument, the mentioned validation will be use; 

**Face validation.** The questionnaire is reviewed by validators (e.g., faculty members/IT experts) to check clarity, grammar, and readability for the target 

respondents. The researcher revises the wording, removes ambiguous items, and improves instructions based on the validators’ comments. 

**33** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

**Content validation.** The same validators evaluate each item’s relevance and alignment with the study objectives and variables using a validation checklist or rating sheet (e.g., relevance, clarity, and appropriateness of indicators). Items that receive low ratings are revised or removed, and the final set of items reflects the operational indicators of [IV/DV]. 

**Pilot testing and reliability.** The revised Google Form is pilot-tested among selected students who are similar to the target respondents but are not included in the final sample. The pilot responses are used to check internal consistency (e.g., Cronbach’s alpha), and items that reduce reliability are revised or omitted before final administration. 

### **Data privacy and form settings** 

The Google Form is designed to minimize personal data collection and to keep responses confidential (e.g., avoiding unnecessary identifiers, limiting access to the response sheet, and storing files in a secured account/drive). The study includes informed consent and follows the Data Privacy Act of 2012 (Republic Act No. 10173) for lawful and transparent processing of any collected information. 

**Discussions on Algorithms/Mathematical Concepts Used/Proposed Solutions** 

**Fundamentals of the Algorithms/Mathematical Model/Formula** 

**34** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

The proposed system, PseudoPy, relies on a hybrid language processing approach that combines both transpilation and browser-based interpretation, Dynamic Programming for intelligent feedback generation through the Levenshtein Distance algorithm, Rule-Based Pattern Matching for natural language normalization, and Sequential Processing for efficient linear execution of core operations. These paradigms collectively enable structured translation, adaptive error feedback, and efficient system performance. 

Syntax-Directed Translation (SDT) serves as the primary paradigm of the compiler engine, where pseudocode is processed according to its grammatical structure and systematically transformed into Python code through a recursive traversal of its logical representation. Dynamic Programming is applied in the Levenshtein Distance algorithm to optimize spelling correction and suggestion generation by decomposing word comparison into subproblems and storing intermediate results in a matrix for efficient computation. Rule-Based Pattern Matching is used in the natural language mapping module, where user inputs are matched against predefined patterns and transformed into standardized pseudocode constructs, enabling consistent and structured interpretation of flexible input. Sequential Processing is employed in both lexical analysis and search operations, where data is processed linearly from start to finish, ensuring computational efficiency with O(n) time complexity and supporting fast execution even on low-resource devices. 

**Theoretical Foundations** 

**35** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

The design and implementation of the PseudoPy system are grounded in computational and educational theories that support structured translation, adaptive feedback, and effective learning. 

The Sequential Parsing and Stack-Based Validation components operationalize the principles of Context-Free Grammar (CFG) by enforcing structural correctness in pseudocode inputs. Through a recursive descent parsing approach, the system verifies that input conforms to defined grammatical rules. The use of a LIFO stack ensures correct nesting and closure of control structures such as loops and conditionals, enabling reliable and deterministic syntax validation. 

The Levenshtein Distance mechanism supports principles of Constructivist Learning Theory by encouraging students to actively identify and correct errors. Instead of providing generic syntax errors, the system computes similarity between user input and valid keywords to generate targeted suggestions. This promotes an iterative refinement process where learners reconstruct their understanding through guided correction. 

The Natural Language Mapping module and Engines are designed in accordance with Cognitive Load Theory. By allowing human-like input expressions that are automatically translated into structured pseudocode, the system reduces extraneous cognitive load associated with strict syntax requirements. This enables learners to focus more on algorithmic logic rather than syntactic precision, thereby improving conceptual understanding. 

The PseudoPy system addresses the syntax barrier in computer science education by introducing a deterministic, rule-based pseudocode-to-Python translation engine grounded in Context-Free Grammar (CFG), ensuring consistent and reproducible outputs. It enhances learning through a validation- 

driven refinement process that acts as an automated feedback loop, enabling iterative correction and logical verification of student input. The system also reduces cognitive load by allowing learners to focus on problem-solving rather than programming syntax, while providing 

**36** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

learning analytics such as algorithm complexity analysis to reinforce computational thinking. 

### **Algorithm Design** 

The PseudoPy system integrates a hybrid set of algorithms that collectively support pseudocode translation, syntax validation, and intelligent feedback generation. It is built on a language processing framework that combines lexical analysis, syntactic and semantic validation, and code generation to convert pseudocode into executable Python code. The Sequential Parsing Algorithm processes input in a strict linear manner, reading and analyzing the source code step by step while preserving the logical flow of the program. The Stack-Based Syntax Validation Algorithm ensures structural correctness by verifying the proper pairing and nesting of control structures such as IF and END IF through a Last-In, First-Out (LIFO) mechanism, thereby preventing unclosed or mismatched blocks during parsing. The Levenshtein Distance Algorithm, implemented using dynamic programming, is utilized to compute the similarity between user input and valid keywords, enabling the system to generate intelligent suggestions for misspelled or partially incorrect commands. In addition, the Linear Search Algorithm is applied during semantic analysis to locate identifiers, keywords, and mapping rules within stored data structures, ensuring accurate validation of declared variables and systemdefined terms. Together, these algorithms form a cohesive computational framework that enhances both the correctness and usability of the translation system. 

**Mathematical Model Formulation** 

The syntax validation and translation process of the system is formally modeled using a **Context-Free Grammar (CFG)** combined with **Syntax-Directed** 

**37** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

**Translation (SDT)** . The CFG defines the structural correctness of pseudocode, while SDT specifies how valid structures are translated into Python code. A Context-Free Grammar is defined as a 4-tuple: 



where: 

- 𝑉is the set of non-terminal symbols (e.g., Program, Statement, Expression) 

- Σis the set of terminal symbols (e.g., BEGIN, IF, THEN, END) 

- 𝑅is the set of production rules that define valid syntactic structures 

- 𝑆is the start symbol representing a complete pseudocode program 

Within the system, CFG serves as the formal specification of the 

pseudocode language. Each valid input must conform to a set of production rules 𝑃𝑟𝑜𝑔𝑟𝑎𝑚 → 

𝐵𝐸𝐺𝐼𝑁 𝑆𝑡𝑎𝑡𝑒𝑚𝑒𝑛𝑡𝐿𝑖𝑠𝑡 𝐸𝑁𝐷 

- 𝐼𝑓𝑆𝑡𝑎𝑡𝑒𝑚𝑒𝑛𝑡 → 𝐼𝐹 𝐶𝑜𝑛𝑑𝑖𝑡𝑖𝑜𝑛 𝑇𝐻𝐸𝑁 𝐵𝑙𝑜𝑐𝑘 𝐸𝑁𝐷 𝐼𝐹 

In the PseudoPy system, the implementation of Context-Free Grammar (CFG) serves as the formal mathematical foundation that ensures the correctness, consistency, and predictability of the pseudocode-to-Python translation process. The grammar follows the formal definition G=(V,Σ,R,S), which is operationalized through six key computational processes within the compiler engine. 

The first process is **Terminal Identification through Lexical Analysis** , which 

corresponds to the identification of terminal symbols (Σ) — the fundamental units of the grammar, including keywords, operators, identifiers, and literals. The lexical 

**38** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

analyzer scans the input pseudocode and classifies each token into its corresponding predefined category, such as BEGIN, IF, arithmetic operators, and numeric values. Such classification ensures that only grammatically valid symbols are passed on to subsequent stages of the translation pipeline, establishing a clean and well-defined token stream as the basis for further processing. 

The second process is **Production Rule Enforcement through Recursive Descent Parsing** . The production rules (R) define the complete set of valid syntactic structures permissible within the language. These rules are operationalized through a recursive descent parser, in which each parsing function corresponds directly to a specific grammar rule. For instance, a conditional statement must conform to the prescribed structure: IfStmt → IF Condition THEN Block [ELSE Block] END IF. The parser validates the token sequence against these rules, and any structural deviation triggers a syntactic error, ensuring that only grammatically well-formed pseudocode proceeds through the system. 

The third process is **Non-Terminal Derivation through Abstract Syntax Tree (AST) Construction** . Non-terminal symbols (V) represent higher-level language constructs such as Program, Statement, and Expression. During parsing, these abstractions are progressively expanded and organized into an Abstract Syntax Tree, which provides a hierarchical representation of the program's structure. The AST captures the relational dependencies between constructs, including block nesting and scope boundaries, thereby enabling accurate semantic analysis and code generation in the stages that follow. 

The fourth process is **LIFO Block Validation through Stack Management** . To enforce proper nesting of block structures, the system employs a Last-In, FirstOut (LIFO) stack mechanism. Each time a block-opening construct — such as IF or WHILE 

— is encountered, it is pushed onto the stack. Removal only occurs upon identification of the corresponding closing construct, such as END IF or END WHILE. Such a mechanism guarantees that all control blocks are correctly matched and hierarchically nested in accordance with the grammar rules, preventing structural ambiguity in complex or deeply nested programs. 

**39** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

The fifth process is **Deterministic Look-Ahead through Predictive Parsing** . The parser incorporates a look-ahead mechanism that allows the system to inspect upcoming tokens without consuming them. Such capability enables the parser to determine the appropriate production rule to apply, particularly in cases where multiple rules share similar prefixes. By resolving potential ambiguities before token consumption, predictive parsing ensures deterministic rule selection and consistent parsing behavior throughout the translation process. 

The sixth process is **Sentinel Enforcement through Structural Delimiters** . Certain reserved keywords function as sentinels that define structural boundaries within the grammar. Keywords such as THEN in conditional statements and DO in iterative constructs explicitly delimit conditions from their corresponding executable blocks. These markers ensure clarity in the parsing process and prevent the misinterpretation of program structure, reinforcing the unambiguous application of grammar rules across all syntactic constructs. 

To enforce proper nesting of control structures, a **stack-based mechanism (LIFO)** is used alongside the CFG. This ensures that every opened construct is correctly closed in reverse order, preventing structural ambiguity in nested statements. 

Building upon CFG, the system applies **Syntax-Directed Translation (SDT)** to associate semantic actions with production rules. Each rule is augmented with translation instructions that define how pseudocode constructs are converted into Python code. For instance, a production rule for a conditional statement includes an action that generates the equivalent Python if statement with proper indentation and syntax. 

The system uses a structured and rule-based process based on Syntax- 

Directed Translation (SDT) to convert pseudocode into executable Python code. This method ensures that the output is consistent and logically correct. The translation process is divided into seven stages, each designed to handle a specific part of the conversion. 

**40** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

The process starts with input acquisition, where the user submits pseudocode through the system interface. This input serves as the basis for the entire translation process. Since users may write pseudocode in different styles, the system performs normalization to standardize the input. In this stage, informal or varied expressions are converted into a consistent set of predefined pseudocode keywords to avoid ambiguity. 

After normalization, the system performs lexical analysis or tokenization. The input is broken down into smaller units such as keywords, identifiers, and operators. This helps the system understand the components of the pseudocode. The system may also detect minor errors in spelling and suggest corrections. Next, syntax parsing is carried out to analyze the structure of the tokens. A stack-based approach is used to ensure that all control structures are properly matched, which helps maintain correct program structure. 

Once the structure is verified, the system performs semantic validation to check the logical correctness of the pseudocode. This includes verifying variable usage, checking data types, and ensuring that operations are valid. Errors such as undeclared variables or incorrect operations are identified at this stage. After validation, the system proceeds to code generation, where the pseudocode is translated into equivalent Python code. Each construct is converted into its proper Python syntax to produce an executable program. 

Finally, the system includes a refinement and feedback loop. The generated code is compared with a reference solution provided by the instructor. The system identifies any logical differences and provides feedback to the user. This allows the user to improve their pseudocode and repeat the process, supporting continuous learning and development. 

**41** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **Sequential Parsing Algorithm(Pseudocode)** 



<!-- Start of picture text -->
// Stage 1: Pattern Matching (Mapping)<br>FOR EACH mappingRule IN globalRules DO<br>IF trimmedLine matches mappingRule.pattern THEN<br>translatedLine = REPLACE trimmedLine WITH mappingRule.result<br>BREAK loop<br>END IF<br>END FOR<br>// Stage 2: Tokenization and Generation<br>tokens = BREAK translatedLine INTO individual words/symbols<br>pythonCode = CONVERT tokens TO Python syntax<br>APPEND pythonCode TO outputBuffer<br>END FOR<br>RETURN outputBuffer<br><!-- End of picture text -->

**42** 



<!-- Start of picture text -->
A kia h<br>Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **Stack-Based Syntax Validation Algorithm** 



<!-- Start of picture text -->
ALGORITHM ValidateBlockStructure(tokens)<br>stack = EMPTY stack // LIFO structure<br>FOR EACH token IN tokens DO<br>IF token IS a starting keyword (BEGIN, IF, WHILE, FOR) THEN<br>PUSH token.type ONTO stack<br>ELSE IF token IS an ending keyword (END, END IF, END WHILE) THEN<br>IF stack IS empty THEN<br>RETURN ERROR “Unexpected END statement”<br>END IF<br>topOfStack = POP from stack<br>IF topOfStack DOES NOT match token.type THEN<br>RETURN ERROR “Block mismatch: Expected END “ + topOfStack<br>END IF<br>END IF<br>END FOR<br>IF stack IS NOT empty THEN<br>RETURN ERROR “Unclosed block: “ + stack.top<br>END IF<br>RETURN SUCCESS<br>END<br><!-- End of picture text -->

### **Levenshtein Distance Algorithm (Dynamic Programming)** 

**43** 



<!-- Start of picture text -->
A ia hh<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
ALGORITHM LevenshteinDistance(word1, word2)<br>m = LENGTH of word1<br>n = LENGTH of word2<br>matrix = 2D ARRAY of size (m+1) x (n+#1)<br>FOR i FROM @ TO m DO matrix[i][@] = i<br>FOR j FROM @ TO n DO matrix[@][j] = j<br>FOR i FROM 1 TO m DO<br>FOR j FROM 1 TO n DO<br>IF word1[i-1] == word2[j-1] THEN<br>cost = @<br>ELSE<br>cost =1<br>END IF<br>matrix[i][j] = MINIMUM OF (<br>matrix[i-1][j] +1,  // Deletion<br>matrix[i][j-1] +1, | // Insertion<br>matrix[i-1][j-1] + cost // Substitution<br>)<br>END FOR<br>END FOR<br>RETURN matrix[m][n]<br>END<br><!-- End of picture text -->

### **Linear Search Algorithm** 



<!-- Start of picture text -->
ALGORITHM LinearSearch(dataList, targetValue)<br>FOR EACH item IN dataList DO<br>IF item.identifier EQUALS targetValue THEN<br>RETURN item // Record found<br>END IF<br>END FOR<br>RETURN NULL // Record not found after O(N) traversal<br>END<br><!-- End of picture text -->

**44** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **Algorithm Implementation** 

This analysis details the technical architecture and implementation of the PseudoPy (Pseudocode-to-Python) translation engine which employs a Syntax-Directed Translation (SDT) 

|Stage `|Process|Logic and<br>Implementati|on|
|---|---|---|---|
|**0. NLP Mapping**|mapper.js|Uses<br>RegEx<br>to<br>normalize|<br>patterns|
|||natural langu<br>_"ask for x"_) int<br>terminals<br>(_"INPUT x"_).|age (e.g.,<br>o standard|
|**1. Lexical Analysis**|Lexer|Scans text in <br>**time**to gener<br>It separates<br>identifiers,<br>and<br>operators.|**O(N) linear**<br>ate tokens.<br>keywords,<br>literals,|
|**2. Syntax Analysis**|Parser|Uses**Recursi**|**ve**|
|||**Descent**to|build an|
|||Abstract Syn<br>(AST). It empl|tax Tree<br>oys a**LIFO**|
|||**stack**<br>to<br>nested|validate|
|||blocks(IF/WH|ILE/FOR).|
|**3. Semantic Analysis**|Semantic Analyzer|Performs|"context-|



|sensitive"<br>checks,|
|---|
|verifying that variables|
|are declared before use|
|and<br>checking<br>for|
|mathematical|



**45** 



<!-- Start of picture text -->
A ia hh<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|||type safety.|
|---|---|---|
|**4. Code Generation**|CodeGenerator|A tree-walker that<br>converts AST nodes into<br>Python strings, handling|
|||indentation<br>and|
|||mapping operators|
|||(e.g.,MOD to %).|





<!-- Start of picture text -->
Input: Pseudocode P<br>Step 1: Lexical Analysis<br>tokens + tokenize(P)<br>Step 2: Syntax Parsing<br>AST + parse(tokens using CFG)<br>if error then<br>return “Syntax Error”<br>Step 3: Initial Code Generation<br>codee « generate Python from AST (SDT)<br>Step 4: Execution Validation<br>result + execute(codeo)<br>Step 5: Check Correctness<br>if result is correct then<br>store mapping (P + codec)<br>return codeo<br>Step 6: Refinement (Core Contribution)<br>candidates + generateAlternativeMappings(P)<br>for each code; in candidates do<br>resulti + execute(codei)<br>if results is correct then<br>store mapping (P + code:)<br>return codei<br>Step 7: Failure Handling<br>return best attempt + feedback<br><!-- End of picture text -->

**46** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

The system incorporates several mechanisms to enhance translation accuracy and user learning. It utilizes the Levenshtein Distance algorithm to perform intelligent keyword correction by identifying minimal differences between user input and valid pseudocode terms, enabling the system to suggest appropriate corrections. Additionally, a validation-driven refinement mechanism is implemented through an automated correction loop that detects structural inconsistencies, such as unclosed blocks, and attempts to resolve them before reprocessing the input. The system also includes a static analysis feature that estimates time complexity by evaluating loop nesting depth, allowing classification of algorithms into standard Big O notations such as 𝑂(1), 𝑂(𝑛), and 𝑂(𝑛<sup>2</sup> ). 

The generated Python code is executed using the Skulpt interpreter, enabling in-browser execution without requiring external dependencies. This allows the system to function offline while maintaining a complete compilation and execution pipeline within the browser environment. 

The system also implements translation through a rule-based mechanism that defines a direct correspondence between pseudocode constructs and their Python equivalents. These mappings are applied during the code generation phase, where each node of the Abstract Syntax Tree (AST) is traversed and converted into Python syntax. 

### **Pseudocode-to-Python Keyword Mapping Table** 

The system uses predefined translation rules to convert pseudocode keywords into Python constructs, as shown below: 

Pseudocode Construct Python Equivalent 

BEGIN (start of block / indentation) 

**47** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|END|(end of block / dedentation)|
|---|---|
|IF condition THEN|if condition:|
|ELSE|else:|
|FOR I = 1 TO n|for i in range(1, n+1):|
|WHILE condition DO|while condition|
|PRINT value|print(value)|
|INPUT variable|input()|
|SET x = value|x = value|
|RETURN value|return value|



### **Tree-Walk Code Generation** 

The Code Generator traverses the Abstract Syntax Tree (AST) constructed during the CFG parsing phase through a process known as a Tree-Walk. For every node encountered during this traversal, the SDT defines a corresponding mapping action that specifies how that construct is to be rendered in Python. For instance, when the system encounters an **AssignmentStatement** node representing the pseudocode construct **SET x TO 10** , the SDT mapping rule instructs the generator to extract the identifier, append an assignment operator, and append the translated expression, producing the Python output **x = 10** . This rule-governed process guarantees that every recognized pseudocode construct is mapped to a predictable and consistent Python equivalent. 

**48** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Example Translation Process: 

Recognition : AssignmentStatement node → SET x TO 10 Mapping Rule: Identifier + '=' + Expression Output : x = 10 

### **Indentation Management** 

The system manages Python indentation through an attribute-based mechanism during code generation. When the Code Generator enters a blocklevel construct such as an IF or WHILE statement, the indent_level attribute is incremented, causing all nested statements to be generated with additional indentation. When the block ends, the attribute is decremented to restore the previous indentation level. 

This mechanism ensures that all generated Python code follows proper whitespace formatting rules, preventing syntax errors caused by incorrect indentation and maintaining compatibility with Python’s block structure requirements. 

### **CFG and SDT in the Translation Pipeline** 

The CFG and SDT components operate as interconnected stages within the translation pipeline, where each stage contributes to transforming pseudocode into executable Python code. 

|**Stage**|**Concept**|**Role in the system**|
|---|---|---|
|Parsing|CFG|Checks if pseudocode|
|||follows correct grammar|
|||rules|



|AST Building|Structural Representation|Builds<br>a|
|---|---|---|
|||hierarchical|
|||structure of the program|



**49** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Code Generation SDT Converts AST nodes into Python syntax 

As shown in the pipeline, CFG ensures that the input follows valid syntactic rules before processing continues. Once validated, the system constructs an Abstract Syntax Tree (AST) that represents the logical structure of the program. Finally, SDT applies translation mappings during AST traversal to convert each node into its corresponding Python syntax. The integration of CFG and SDT within this pipeline ensures a deterministic and structured translation process, enabling consistent conversion from pseudocode to Python while preserving logical correctness.+ 

- [START] ↓ 

- [Input Student Pseudocode (P_s)] ↓ 

[Lexical Analysis] ↓ [Syntax Parsing (CFG)] ↓ ◇ Syntax Error? ├── YES → [Display Syntax Feedback] → [END] └── NO 

↓ 

**50** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**|
|---|---|
|[E<br>──|MA + LGA INTELLIGENCE MODULE]<br>──────────────────────────────────────────|
|↓||
|[1.|Multi-Stage Syntax Normalization]|
|→|Convert P_s→Tokens_s|
|→|Convert Instructor Logic (P_i)→Tokens_i|
|↓||
|[2.|Dual AST Generation]|
|→|Generate Student Tree (T_s)|
|→|Generate Instructor Tree (T_i)|
|↓||
|◇|AST Error in T_s?|
|├─|─YES→[Return Syntax-Level Feedback]<br>→[END]|
|└─|─NO|
|↓||
|[3.|Semantic Pattern Matching]|
|→ <br>→|Identify patterns (loops, conditions, etc.)<br>Align variables (e.g., sum↔total)|
|↓||
|[4.|Logic Gap Analysis (LGA)]|
|→|Detect Missing Logic (nodes in T_i not in T_s)|
|→ <br>↓|Detect Misplaced Logic (wrong structure)|



**51** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF COMPUTING STUDIES**|
|---|
|→Precision<br>→Recall|
|→F1 Score (M)|
|↓|
|[6. Generate Pedagogical Hints (H)]<br>────────────────────────────────────────────|
|↓|
|[Generate Python Code (C) using SDT]|
|↓|
|[Execute Code]|
|↓|
|◇Output Correct?|
|├──YES→[Store Mapping (P_s→C) + M + H]→[END]|
|└──NO|
|↓|
|[Generate Alternative Code]|
|↓|
|◇Correct?|
|├──YES→[Store Mapping (P_s→C) + M + H]→[END]|
|└──NO|
|↓|
|[Return Best Attempt + Feedback]<br>→Include:|



**52** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

- Mastery Score (M) 

- Logic Gap Feedback (H) ↓ 

[END] 

The system processes student pseudocode through lexical analysis and syntax parsing using CFG. The system ensures the accuracy and correctness of student solutions by using the **instructor-defined pseudocode (P) ᵢ** as the ground truth reference for evaluation. Instead of relying solely on final output, the system performs **multi-level validation** combining structural, semantic, and execution-based checks. If valid, it performs deeper analysis using AST comparison, semantic matching, and Logic Gap Analysis to evaluate correctness and generate a mastery score with feedback. It then translates the pseudocode into Python and executes it. If execution fails, the system enters a **refinement loop** , attempting alternative mappings to auto-repair the code and return the best possible output with feedback. Along with this to provide intelligent and fully offline feedback, the system performs Static Program Analysis by analyzing the program’s Abstract Syntax Tree (AST) and Symbol Table instead of relying on simple keyword matching or regular expressions. Through components implemented in app.js and compiler.js, the system dynamically evaluates code structure, variable usage, logic flow, and algorithmic behavior to generate context-aware suggestions such as detecting deep nesting, undeclared variables, type mismatches, redundant statements, and structural differences from instructor solutions. The system also supports validation-driven refinement, where it automatically generates and tests possible corrections for syntax errors before suggesting fixes to the learner, enabling more adaptive 

the offline 

and non-hard-coded feedback within 

compiler environmen 

**53** 



<!-- Start of picture text -->
f kta}<br>Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

In addition, the system incorporates a root cause analysis mechanism to identify failures in pseudocode processing and code generation. Errors are primarily attributed to syntax issues during parsing, ambiguities in Abstract Syntax Tree (AST) construction, semantic or logical gaps in the student’s solution, limitations in syntax-directed translation (SDT) mappings, and runtime execution faults. To address theFIse, the system employs a refinement loop that utilizes alternative mapping strategies to automatically repair invalid or incomplete pseudocode. This approach ensures that, instead of terminating on failure, the system produces a best-effort code output accompanied by diagnostic feedback and suggested corrections, thereby improving both system robustness and instructional effectiveness. 

This section demonstrates how the PseudoPy system processes actual input data through a step-by-step execution of the translation pipeline using a sample pseudocode problem 

Example: Sum of Even Numbers 

### **1. Input (Pseudocode)** BEGIN 

SET numbers TO [2, 5, 8, 11] The system receives the following pseudocode from the user: SET sum TO @ 

**2. Lexical Analysis (Tokenization)** 

**54** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

The lexer converts the input into a sequence of terminal symbols representing keywords, identifiers, and operators used by the grammar. 

### **3. Stage 2: Syntax Analysis (AST Mapping)** 

The Parser applies the CFG rules to build a hierarchical tree. Internally, the structure looks like this: 

Program 

AssignmentStatement (id: "numbers", expr: "[2, 5, 8, 11]") 

AssignmentStatement (id: "sum", expr: "0") 

ForEachStatement (iterator: "num", list: "numbers") 

Body: 

IfStatement (condition: "num % 2 == 0") 

Body: AssignmentStatement (id: "sum", expr: "sum + num") 

PrintStatement (expr: '"Total: " + sum') 

### **4. Stage 3: Semantic Inspection** 

The Semantic Analyzer checks the tree for logic safety: 

Check: Is sum declared/initialized before being used in sum + num? Yes. Check: Is num declared? Yes (implicitly by the FOR EACH loop). Result: Logic verified as "Safe." 

### **5. Stage 4: Code Generation (Python Output)** 

The Generator produces the final, executable Python code: 

**55** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

# Generated by PseudoPy 

numbers = [2, 5, 8, 11] 

sum = 0 

for num in 

numbers: if num % 2 == 0: 

sum = sum + num 

print("Total: " + str(sum)) 

### **6. Stage 5: Real-time Execution (Interpretation)** 

The Skulpt Interpreter runs the Python code above and displays the final result in the system console: 

Console Output: Total: 10 

### **Complexity Analysis** 

The researchers evaluate the algorithms in terms of efficiency and practicality to support the teaching of basic algorithm concepts. This includes analyzing their time and space complexities and scalability to ensure effective visualization of core algorithm behaviors within the system. 

### **Time Complexity** 

The system is designed to ensure fast execution, enabling students to obtain results in real time, even on low-performance devices. The Sequential 

Parsing Algorithm operates with a time complexity of O(n), where the execution time increases 

**56** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

linearly with the number of input lines. This is achieved by processing the code in a single pass from start to finish without re-evaluating previously read statements, thereby maintaining efficient performance. Similarly, the StackBased Syntax Validation Algorithm also operates in O(n) time complexity by scanning each token once to verify the correct pairing of control structures such as IF and END IF. For searching operations within user records or exercises, the system employs a Linear Search Algorithm with O(n) complexity, which remains efficient due to the relatively small dataset size stored locally. In addition, the Levenshtein Distance Algorithm, used for spelling correction and suggestion generation, operates with a time complexity of O(m × n). Although computationally more intensive, it is applied only to short string comparisons, allowing it to execute efficiently in practice. 

### **Space Complexity** 

The system is optimized to minimize memory consumption to ensure smooth performance within a browser-based environment. During translation, the Sequential Parsing stage constructs an Abstract Syntax Tree (AST), which requires O(n) space proportional to the size of the input code. The Stack-Based Syntax Validation mechanism utilizes O(d) space complexity, where d represents the depth of nested control structures. Since typical student inputs involve shallow nesting, memory usage remains minimal in practice. The Linear Search Algorithm operates with O(1) space complexity, as it does not require additional data structures beyond a single traversal pointer. Meanwhile, the Levenshtein Distance Algorithm requires O(m × n) space due to the construction of a comparison matrix; however, this remains negligible in practice because it is applied only to short text inputs. 

### **System Development Methodology** 

The proposed study Bridging Pseudocode and Python: An Algorithmic Approach to Automated Code Generation will be developed using the Agile Scrum 

**57** 



<!-- Start of picture text -->
Guiversity of Cabupao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

methodology. This approach uses repeated cycles and iterative approach, focusing on continuous development, testing, and system enhancements through short, focused cycles called sprints. For a system where translation rules and validation processes demand constant tweaking and refinement, this approach proved ideal [35]. 



<!-- Start of picture text -->
se ‘ SPRINT :<br>° Sz<br><!-- End of picture text -->

Figure 2: Agile Process Model 

### **Phases** 

The first stage, the **Initialization Phase** , established the foundational groundwork of the project. During this phase, the research team defined the core research problem bridging pseudocode and Python through rule-based translation and validation and identified the primary system goals, which included measurable metrics, offline capability, adaptive feedback, and educational usability. The Scrum team was formally organized, consisting of four Bachelor of Science in Computer Science researchers assigned to specific roles, namely the Product Owner, Scrum Master, and Developers. A Product 

Backlog was subsequently created, enumerating all required system features including the Lexical, Syntax, Semantic, Code Generation, and Feedback modules, as well as metrics tracking, offline functionality, 

**58** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

and documentation and conversion analysis components. The output of this phase was a clear and structured roadmap of system requirements and sprint objectives that guided all subsequent development activities. 

The second stage, the **Planning and Estimation Phase** , focused on defining sprint goals and estimating workload distribution. Sprint Planning Meetings were conducted to select backlog items for each sprint cycle, and task complexity was estimated using a story points scale ranging from one to five. Tasks were assigned to team members based on individual expertise in areas such as algorithm design, user interface development, and software testing. Each sprint was set to a fixed duration of two weeks, with measurable goals established for each cycle: Sprint 1 targeted Lexical and Syntax Analysis; Sprint 2 addressed Semantic Analysis and Code Generation; Sprint 3 focused on the Execution and Feedback Module; and Sprint 4 covered the Metrics Dashboard and Offline Mode implementation. The resulting output of this phase was a detailed Sprint Plan containing timelines, task assignments, and clearly defined expected deliverable 

In the proposed system, the researchers used UML Diagrams to clarify how the system was constructed in more detail. The proposed system used Use Case Diagram to determine: 

**59** 



<!-- Start of picture text -->
(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
‘ «include»<br>Translate 4<br>Sa Python as<br>Suggestions 7,’ «extend»<br>“al Manage Users<br>“Cant \<br>Exercises<br>S= (CRUD)<br>Admin<br>‘Analytics<br>Z<br>(CRUD)<br><t<br>Instructor Python Code,<br><!-- End of picture text -->

**Figure 3. Use Case Diagram** 

Shows who uses the system and what they can do. It identifies three actors Student, Instructor, and Admin and maps each one to the specific features. For example, Students can write pseudocode, translate it, and attempt exercises; Instructors can manage exercises and view analytics; Admins can manage user 

**60** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

accounts and execute code. 



<!-- Start of picture text -->
i Ce<br>(WriteAdPseudocode _)<br>¢ rere+ . Kegvert<br>(Gow tre tesage a)<br>es a : (_mtemaptrs_)<br>| 4 a!<br>aD ea<br>7 C_emmintenrowen<br>(sive /Downlond Pythoncode}—+@<br><!-- End of picture text -->

### **Figure 4. Activity Diagram for Pseudocode to Python Translation** 

This technical UML activity diagram illustrates the **internal processing steps of the system** when converting pseudocode into executable Python code. After the user submits pseudocode, the system first validates its syntax. If the syntax is incorrect, an error message is displayed, and the user is prompted to revise the pseudocode. If the pseudocode passes the validation stage, the system performs lexical analysis to identify tokens, followed by syntax parsing to verify the structure of the pseudocode statements. The system then conducts semantic analysis to determine whether the logic and meaning of the statements are valid.The system also checks for logical errors that may affect program execution. If logical errors are detected, they are displayed to the user for correction. If no errors are found, the system generates the Python code, executes the program, and displays the output to 

**61** 



<!-- Start of picture text -->
(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

the user. The user may then choose to save or download the generated code. 



<!-- Start of picture text -->
oe Yes Logical Errors.<br>:<br>© C)<br><!-- End of picture text -->

### **Figure 5. Activity Diagram for Code Execution** 

This activity diagram illustrates the interaction between the user and the system The system then verifies whether the pseudocode syntax is valid. If the syntax is invalid, the system displays an error message prompting the user whether to edit or rewrite the pseudocode before submitting it again. The system then checks for logical errors. If logical errors are detected, the system displays the error message and allows the user to revise the pseudocode. If no logical errors are found, the system generates the corresponding Python code. 

The generated code is then executed, and the output is displayed to the user. Finally, the user verifies whether the output is correct. If the 

**62** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

result is correct, the user may save or download the generated Python code. Otherwise,  the  user  can  modify the  pseudocode  and  repeat the 



<!-- Start of picture text -->
process. [ter]<br>UID STUDENT<br>Username INSTRUCTOR}<br>FullName ADMIN<br>Email<br>Role<br>Authenticate() ExerciselD<br>Title<br>Difficulty<br>ExpectedPseudocode<br>Update()<br>Delete()<br>ActivityLog<br>LogID TranslationEngine CodeExecutor<br>petontype Translate() RunPython()<br>Timestamp ParseCondition() HandieOutput()<br>CodeSnippet Applyindentation() HandleError()<br>FeedbackAnalyzer FeedbackReport<br>Analyze() OverallScore<br>CheckStructure() Strengths<br>CheckSyntax() Suggestions<br><!-- End of picture text -->

### **Figure 6. Class Diagram for the Proposed System** 

Shows the structure and relationships of the system's core components. It includes classes like User Exercise ActivityLog, TranslationEngine, CodeExecutor, and FeedbackAnalyzer with the attributes, methods, and how they relate to each other (e.g., a User creates ActivityLog records; TranslationEngine feeds code to 

**63** 



<!-- Start of picture text -->
om)<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

CodeExecutor).s 



<!-- Start of picture text -->
sabe lithe.<br>String username<br>+String role +generateFeedback(pseudocode)<br>‘+String status +analyzeStructure()<br>+login() +checkSyntaxBalance()3<br>manages persits data analyzes input<br>cae Ct<br>++String description ie<br>*String difficulty silat ‘pseudocodeToPython(pseudocode)<br>++String createdBy sfoGetalt(y “Indent(level)<br>*foAdd\) +translateCondition(cond)<br>+tunPythonCode(code)<br>+simulateExecution(code)<br><!-- End of picture text -->

### **Figure 7. Class Diagram** 

Class Diagram represents the logical structure of the PseudoPy system. It shows the main objects (classes), properties (attributes), behaviors (methods), and how connected to one another. The system is built around three types of users Student, Instructor, and Admin each with own set of permissions. Users interact with 

**64** 



<!-- Start of picture text -->
Guiversity of Cabupao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Exercises created by Instructors, and every action they take is recorded in an ActivityLog. 



<!-- Start of picture text -->
sing it Tex]<br>trackedby<br><!-- End of picture text -->

### **Figure 8. ER Diagram — Firestore Data Model** 

The Firestore database has three collections. USERS stores account information for all roles (Student, Instructor, Admin). EXERCISES stores tasks created by Instructors, linked back to the user who created them. ACTIVITY_LOGS records every action (translation, execution, exercise attempt) that a user performs, referencing both the user and the exercise involved. 

**65** 



<!-- Start of picture text -->
Guiversity of Cabupao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
1 Client — Browser<br>Service WorkerPWA<br>¥<br>—<br>appis<br>Sia oayfApplication Logic:1<br>NoSQL Database pseudocodeToPython ‘Skuipt Python Runtime generateFeedback<br>( | ) f‘Shadpt:<br>users: exercises activity ‘skulpt.minjs ‘skulpt-stdiib js<br><!-- End of picture text -->

**Figure 9. System Architecture Diagram** 

The system runs entirely in the browser no backend server needed. Index.html provides the UI, while app.js handles all logic including the TranslationEngine, CodeExecutor, and FeedbackAnalyzer. Data is stored and retrieved from Firebase Firestore (cloud database). Python code execution uses Skulpt, loaded from a CDN. A Service Worker (sw.js) enables offline/PWA support by caching the app locally. 

The third stage, the **Implementation Phase** , constituted the core development period of the system, executed through a series of iterative sprints. Development activities involved implementing rule-based translation using Context-Free Grammar and Syntax-Directed Translation principles, while testing activities validated pseudocode samples for syntax accuracy, runtime 

error rate, and execution success. Daily Standup meetings were held to maintain team alignment, discuss progress, and 

**66** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

address blockers. Feedback from panel evaluators was systematically integrated, particularly recommendations pertaining to conversion analysis, error handling improvements, and scope definition. Documentation was updated after each sprint to record algorithm workflow refinements and mathematical model adjustments. The cumulative outputs of this phase included working system increments delivered after each sprint, updated documentation reflecting conversion analysis and error-handling improvements, and enhanced modules supporting adaptive feedback and offline code execution. 

The fourth and final stage, the **Release Phase** , finalized the system and prepared it for deployment and formal evaluation. Sprint Review sessions were conducted to present completed features to the panel and gather structured feedback, while Retrospective meetings allowed the team to reflect on sprint performance and identify areas for further improvement. The system was subsequently packaged as a Progressive Web Application to support offline use and deployed for evaluation with third-year programming students. Usability testing was conducted, and evaluation metrics including accuracy, precision and recall scores, runtime error rate, and execution time were systematically measured and analyzed. Documentation was further refined to include complete conversion examples illustrating the full pipeline from word problem to pseudocode to Python code to output. The final outputs of this phase were the fully deployed version of PseudoPy, an evaluation report documenting measurable system improvements, and revised documentation demonstrating the system's transparency, error-handling capabilities, and clearly defined operational scope. 

**Statistical Treatment of Data** 

### **Population and Sampling** 

This study involved Bachelor of Science in Computer Science students and 

**67** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

Information Technology students at Pamantasan ng Cabuyao, mainly those who were taking or had finished introductory programming courses. These students were selected because they have basic programming skills and are the primary users of pseudocode and Python programming language. Students knowledge background allowed them to use the system, complete programming tasks, and provide helpful feedback on its features and learning support. 

The total number of people comes directly from the official enrollment records of the College of Computing Studies, specifically for the third year. Slovin's formula is then used to find the smallest sample size needed, with a 5% margin of error. It's an easy choice for a group of people that is already welldefined and easy to reach. 

Purposive sampling is used to choose who from that group will take part. Students were picked because they had experience with programming languages such as Python, Java, or JavaScript. To be eligible, a student must be officially in third year and taking advanced computing or major subjects this semester. It's making sure that the people who are judging the system have enough information to perform a task, provide feedback and experience as well as to check if it will be beneficial for programming education. 

Through purposive sampling, the study ensured that all selected participants were appropriate users who could provide meaningful feedback. This approach allowed the researchers to evaluate how effectively the system delivers adaptive programming exercises, generates automated feedback, and supports the improvement of programming skills, logical reasoning, and proper code structure. 

**Statistic Formula/Example Use Case** 

**COLLEGE OF COMPUTING STUDIES** 

**68** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|Weighted Mean|xˉ= fx f\bar{x}<br>∑<br>∑<br>= \frac{\sum fx}|Usability|
|---|---|---|
||{\sum f} xˉ= f fx<br>∑∑|(e.g.,<br>3.4=Agree)|
|Frequency %|(f / n) × 100|Number of<br>Respondent|
|Cronbach's α|Internal consistency|Questionnaire<br>validation|
|Slovin's n|n = N / (1 + N (0.05)²)|Sample<br>sizing|



Table 2. Population of Students 

### **Evaluation and Scoring** 

Responses are collected through the Google Forms questionnaire and automatically recorded in the linked Google Sheets file. After the data collection period, the responses are checked for completeness (e.g., required items are answered) and are screened for invalid entries (e.g., duplicate submissions if email-collection is enabled, or clearly inconsistent responses). All accepted responses are then prepared for statistical treatment by coding each Likert choice into its corresponding numerical value. 

`Each item in the questionnaire uses a Likert scale and is scored numerically to allow computation of descriptive statistics. 

For a **4-point Likert scale** , the scoring uses: 

Strongly Agree 

4 

Agree 3 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

**69 COLLEGE OF COMPUTING STUDIES** Disagree 2 Strongly Disagree 1 **Table 3. Scoring Range of the Likert Scale** If the instrument includes negatively worded statements, reverse scoring is applied before analysis. For a 4-point Likert scale, the scores are reversed as follows: 4 becomes 1, 3 becomes 2, 2 becomes 3, and 1 becomes 4. Item scores are then aggregated to compute (a) the mean per statement and (b) the composite mean per construct or variable (the average of all items under that construct). The analysis uses descriptive statistics to interpret the respondents’ evaluation of each construct measured by the Google Form. • Frequency and percentage are used to describe the respondent profile (e.g., BSCS vs. BSIT, section). • Weighted mean (mean) is used to summarize Likert responses per item and per construct. n where x is the numerical score per response and n is the number of respondents. . | To interpret the computed means, the study uses fixed ranges aligned with the **4point Likert scale** : 

**70** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|**Mean Range**|**Verbal Interpretation**|
|---|---|
|3.26 - 4.00|Strongly Agree|
|2.51 - 3.25|Agree|
|1.76 - 2.50|Disagree|
|1.00 - 1.75|Strongly Disagree|



### **Table 4. Evaluation Criteria** 

The results of the weighted mean will be used to determine the overall performance of the system based on the selected criteria from ISO/IEC 25010:2011. Each category (usability, functional suitability, and performance efficiency) will be evaluated separately and interpreted accordingly 

The handling and storage of the Google Forms responses follow the Data Privacy Act of 2012 (Republic Act No. 10173), ensuring that collected information is processed for academic purposes and kept confidential. 

**71** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

### **Ethical Considerations** 

Ethics isn’t a formality in this study — it’s a foundation. Given that the research involves real students and educators engaging with a system designed to shape how they learn, every step of the process is handled with that responsibility in mind. Before anyone participates, informed consent is obtained — and not just as a signature on a form. Participants are walked through what the study is actually trying to do, how the process works, what risks exist if any, and what they stand to gain. That conversation happens before any commitment is made, because agreeing to something you don’t fully understand isn’t really consent. 

Any personal information collected along the way is kept strictly confidential. The system itself is also designed with this in mind — it doesn’t collect or process data in ways that could compromise anyone’s privacy or cause harm. We did a lot of research and there are three things that we always kept in mind: we respect the people who're part of the research and let them make their own decisions we are honest about what we are doing and we follow the rules that are, in place to make sure everything is fair. 

**72** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

The main goal of our research is not just to find some answers but to add something to the field that's good and was done correctly. We want to make something that is not just useful but also something that is worth doing. Research is a part of this and we want to do it the right way 

## . **Literature Cited** 

**[1]** R. Weeda, S. Smetsers, and E. Barendsen, “Unraveling novices’ code composition difficulties,” _Computer Science Education_ , vol. 34, no. 3, pp. 414– 441, 2024. 

**[2]** S. P. Tiwari _et al._ , “Challenges in Translating Algorithmic Logic to Syntactically Correct Python Code,” in _Proc. IEEE International Conference on Computing, Communication and Automation (ICCCA)_ , 2023, pp. 145–150. 

**[3]** T. Winkler, A. Scholl, and M. E. K. Berg, “Cognitive overload in introductory programming: The impact of syntax on problem-solving focus,” _ACM Transactions on Computing Education_ , vol. 24, no. 2, pp. 1–25, 2024. 

**[4]** S. Acharjee, “Anyone can code: Algorithmic thinking,” _IEEE Access_ , vol. 10, 

pp. 26730–26742, 2022. 

**73** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

**[5]** B. Wang _et al._ , “Bridging the gap between pseudocode and program implementation: Student difficulties and common errors,” _Journal of Computer Science Education_ , vol. 33, no. 1, pp. 45–68, 2023. 

**[6]** A. Alokla, W. Gad, W. Nazih, M. Aref, and A.-B. Salem, “Retrieval-based transformer pseudocode generation,” _Mathematics_ , vol. 10, no. 4, p. 612, 2022. 

**[7]** H. Keuning, J. Jeuring, and B. Heeren, “A systematic evaluation of automated feedback in introductory programming education,” _Computer Science Education_ , vol. 33, no. 2, pp. 145–178, 2023. 

[8]R. Olsen, "Deep learning pseudocode generation: A qualitative analysis," Master's thesis, Santa Clara University, Santa Clara, CA, USA, 2022. 

[9] InterServer, "How to write pseudocode and convert it to Python," _InterServer Tips Knowledge Base_ , 2025. 

[10] PiyuSCS, "Converting pseudocode to programs: Step-by-step guide with examples," 2025. 

[11]BBC Open Source, "Pseudocode to Python translation," _VC2 Pseudocode Parser_ , 2022. 

[12 B. Stroustrup, _The C++ Programming Language_ , 5th ed. Boston, MA, USA: Addison-Wesley, 2022. 

[13] K. Taheri, M. R. Khosravi, and H. Fathi, "Applications of Levenshtein distance in modern string matching and error correction algorithms," _J. Inf. Process. Syst._ , vol. 18, no. 4, pp. 897–912, 2022. 

[14] B. A. Becker, K. Quille, and A. McGowan, "Developing and validating a competency-based assessment framework for introductory programming," 

_ACM Trans. Comput. Educ._ , vol. 24, no. 3, pp. 1–28, 2024. 

**74** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

[15] D. Nam, A. Macvean, V. Hellendoorn, B. Vasilescu, and B. Myers, "Studying the effect of AI code generators on supporting novice learners in introductory programming," in _Proc. CHI Conference on Human Factors in Computing Systems_ , 2023, pp. 1-23 

[16] M. Kazemitabaar et al., "Studying the effect of AI code generators on supporting novice learners in introductory programming," _Journal of Computer Science Education_ , vol. 15, no. 2, pp. 189-212, 2024. 

[17] J. Leinonen et al., "PyDex: Repairing bugs in introductory Python assignments using LLMs," _ACM Transactions on Computing Education_ , vol. 24, no. 2, pp. 1-27, 2024. doi: 10.1145/3649850 

[18] R. Van der Meer, "Investigating the influence of code generating technologies on learning process of novice programmers in higher education computer science course," Master's thesis, University of Twente, Enschede, Netherlands, 2023 

[19] N. C. Wordu, “The challenges of computer science education in the 21st century in a developing economy,” American Journal of Social and Humanitarian Research, vol. 3, no. 2, 2022. 

[20] R. Olsen, "Deep learning pseudocode generation: A qualitative analysis," Master's thesis, Santa Clara Univ., Santa Clara, CA, USA, 2022. 

[21] A. Hundhausen and S. Brown, “Algorithm visualization in computer science education: A systematic review,” ACM Transactions on Computing Education, vol. 23, no. 2, 2023 

[22] Python Software Foundation, "Python Documentation," 2024. 

**75** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

[23] TechTarget, "Pseudocode to Python translation: Best practices and implementation," 2025. 

[24] GPT-4.1 Benchmarking Study, "Comparative analysis of LLM performance in Python code generation," 2025. 

[25]Nanyang Technological University, "Converting pseudocode into Python functions for teaching greedy algorithms," Final Year Project, School of Computer Science and Engineering, Nanyang Technological University, Singapore, 2024. 

[26] R. Van der Meer, "Investigating the influence of code generating technologies on learning process of novice programmers in higher education computer science course," Master's thesis, Univ. Twente, Enschede, Netherlands, 2023.. 

[27] IEEE, *ISO/IEC/IEEE 24765:2017 Systems and Software Engineering — Vocabulary*, IEEE/ISO/IEC Standard. 

[28] S. Muchnick, Advanced Compiler Design and Implementation, 2nd ed., San Francisco, CA, USA: Morgan Kaufmann, 2022. 

[29] B. W. Kernighan and D. M. Ritchie, The C Programming Language: Modern Edition, 2nd ed., Boston, MA, USA: Pearson, 2023. 

30] B. Stroustrup, The C++ Programming Language, 5th ed., Boston, MA, USA: Addison-Wesley, 2022. 

[31] Oracle, "The Java Language Environment," _Oracle Documentation_ , 2024. 

[32] B. A. Becker, K. Quille, and A. McGowan, "Developing and validating a competency-based assessment framework for introductory programming," 

_ACM Trans. Comput. Educ._ , vol. 24, no. 3, pp. 1-28, 2024. doi: 10.1145/3651154 

**76** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

[33] D. Weintrop and U. Wilensky, "Comparing block-based and text-based programming in high school computer science classrooms," _ACM Trans. Comput._ 

_Educ._ , vol. 22, no. 1, pp. 1-25, 2022. doi: 10.1145/3487053 

[34] H. Keuning, J. Jeuring, and B. Heeren, "A systematic evaluation of automated feedback in introductory programming education," _Comput. Sci. Educ._ , vol. 33, no. 2, 

pp. 145-178, 2023. doi: 10.1080/08993408.2023.2178456 

[35] G. Tetteh, "Empirical Study of Agile Software Development Methodologies: A Comparative Analysis," _ResearchGate_ , 2024. [Online]. Available: 

[36] T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein, _Introduction to Algorithms_ , 4th ed. Cambridge, MA, USA: MIT Press, 2022. [Online]. Available: 

[37] T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein, *Introduction to Algorithms*, 4th ed. Cambridge, MA, USA: MIT Press, 2022. 

[38] G. A. V. Pai, _A Textbook of Data Structures and Algorithms_ . Hoboken, NJ, USA: Wiley, 2023. 

[39] S. Muchnick, Advanced Compiler Design and Implementation, 2nd ed., San Francisco, CA, USA: Morgan Kaufmann, 2022. 

[40] K. Taheri, M. R. Khosravi, and H. Fathi, “Applications of Levenshtein distance in modern string matching and error correction algorithms,” Journal of Information Processing Systems, vol. 18, no. 4, pp. 897–912, 2022. 

[41] _Phases of a Compiler_ — GeeksforGeeks (overview of lexical, syntax, semantic, and code generation phases. 

[42] _Semantic Analysis (compilers)_ — Wikipedia (semantic checks in compilers) 

[43] _Compiler Design: Syntax-Directed Translation_ — TutorialsPoint (explains how code generation works and how translations are structured): 



<!-- Start of picture text -->
Guibversity of Cabupao<br>(PAMANTASAN NG CABUYAO)<br>COLLEGE OF COMPUTING STUDIES 77<br>[44] A. Adeoye, “Purposive Sampling,” in Purposive Sampling: Concepts<br>ia heeaaad pean PNC:AA-FO-27 rev.0 02012023<br>and Applications in Scientific Research, ResearchGate Publication, Nov. 2025.<br>secetecedet AL,<br>a ANR<br>| consider<br>COLLEGE OF COMPUTING STUDIES 78<br>Frequently Asked Questions lina<br>esate ae dividual<br>[Se ‘oblem-<br>Appendices<br>foe re amram pa eer penoanrie ooo aaa aaa 1023-present)<br>La a aaa ca al 43min §3 sec 1 hr 26min yao(PNC)<br>COLLEGE OF COMPUTING STUDIES 79<br>: reading speaking<br>time time<br>(2017 - 2023)<br>gissues<br>COLLEGE OF COMPUTING STUDIES 80<br>1 15<br>shentn cee it Critical Advanced — toon.2017<br>This text scores better than 96%<br>EXPERTIEc+ attzoxts chockedty Gra ftenin. ~ive—o— ee<br>+ Analytical COLLEGE OF COMPUTING STUDIES 2% Overall Similarity 81<br>+Adaptabil arte te tg =<br>Plagiarism fered<br>+ Data Anal EE scscsciaa<br>+ IT Suppor (/ 100 aeoreoo Tenses‘an mare<br>COLLEGE OF COMPUTING STUDIES 82<br>REFERED XS SOUICOS @enema omens 5 teeta<br>AssistResearch: Prof. TeaFo:100%in archivesof your textof academicmatches ere—ae_® somnsamm,ag, See 2025<br>Cabuyao aaa<br>COLLEGE OF COMPUTING STUDIES 83<br>Email: flhabla<br>Assist Prof. C<br>Language Software Summary Report Faculty Mem ay DED<br>cmbna@pnc.edu.ph<br>A kia COLLEGE OF COMPUTING STUDIES © 84<br>-=‘<br>©<br>COLLEGE OF COMPUTING STUDIES 85<br><!-- End of picture text -->

