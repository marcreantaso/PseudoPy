**i** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

**COLLEGE OF COMPUTING STUDIES** 

Translating Pseudocode to Python: An Algorithmic Approach to Automated Code Generation **A Thesis** Submitted to the Faculty of The College of Computing Studies **PAMANTASAN NG CABUYAO** City of Cabuyao, Laguna 

In Partial Fulfillment of the Requirements for the Degree: **BACHELOR OF SCIENCE IN COMPUTER SCIENCE By:** Bautista, Mark Andrew S. Daet, Mikaella C. Reantaso, Marc Gian R. May 2026 

**ii** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**||
|---|---|---|
||**TABLE OF CONTENTS**||
|Title|Page|i|
|Reco|mmendation Letter|ii|
|Table|of Contents|iii|
|List o|f Tables|v|
|List o|f Figures|vi|
|List o|f Appendices|ix|
|**CHA**|**PTER**||
|**I**|**THE PROBLEM AND ITS SETTING**|**Page**|
||Introduction|1|
||Statement of the Problem|3|
||Scope and Limitation|4|
||Significance of the Study|5|
|**II**|**REVIEW OF RELATED LITERATURE AND STUDI**|**ES**|
||Conceptual Literature|7|
||Research Literature|10|
||Review of Related Literature|10|
||Difficulties of Programmers|11|
||Pseudocode as Pedagogical Tool|13|
||Automated Pseudocode-to- Code Generation|14|
||Review of Related Studies|15|



**iii** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**||
|---|---|---|
||Competency-Based Assessment<br>of|15|
||Programming Skills in Higher Education|16|
||Block-Based to<br>Text-BasedProgramming|16|
||Transition Tools|17|
||Automated Feedback System in Introductory|25|
||Programming Course|25|
||Theoretical Background|17|
||Conceptual Framework|25|
||Synthesis|21|
||Definition of Terms|22|
|**III**|**METHODS AND PROCEDURES**||
||Research Design|30|
||Research Locale|30|
||Respondents of the Study|31|
||Data Gathering Procedure|32|
||Discussion<br>on<br>Algorithms/Mathematical||
||Concepts Used/Proposed Solution|43|
||System Development Methodology|56|
||Statistical Treatment of Data|56|
||Ethical Considerations|70|
|**LITE**|**RATURE CITED**|69|
|**APP**|**ENDICES**|77|





<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**|**iv**|
|---|---|---|
||**LIST OF TABLES**||
|**Table**||**Page**|
|1|Respondents of the Study|30|
|2|Pseudocode Translation Engine|43|
|3|Keyboard Mapping|46|
|4|Transition Pipeline|48|
|5|Table Formula|67|
|6|Likert Scale|68|
|7|Evaluation Criteria|69|
|8|Comparative Performance Between PseudoPy and<br>Traditional Method|82|
|9|Hybrid Performace per Test Case|88|
|10|Performance Metrics||
|11|End User Assessment in Usability|94|
|12|End User Assessment in Learnability|96|
|13|End User Assessment in Efficiency|97|
|14|End User Assessment in Reliability|99|
|15|Overall End User Assessment|100|
|16|IT Expert Evaluation in terms of Functional<br>Suitability|102|
|17|IT Expert Evaluation in terms of Usability|103|
|18|IT Expert Evaluation in terms of Reliability|105|
|19|IT Expert Evaluation in terms of Performance|106|
||Efficiency||
|20|IT<br>Expert<br>Evaluation<br>in<br>terms<br>of|108|





<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**|**v**|
|---|---|---|
||Maintainability<br>||
|21|Overall IT Expert Evaluation in terms of|122|
||**LIST OF FIGURES**||
|**Figure**||**Page**|
|**1**|Theoretical Framework|21|
|2|Conceptual Framework of the Proposed System|23|
|3|Agile Process Model|17|
|4|Use Case Diagram|58|
|5|Activity Diagram for Pseudocode  to Python Translation|59|
|6|Activity Diagram for Code Execution|60|
|7|Class Diagram for the Proposed System|61|
|8|Class Diagram|62|
|9|ER Diagram — Firestore Data Model|63|
|10|System Architecture Diagram|64|
|11|System Algorithm Flowchart|73|
|12|Pipeline Stages|90|





<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||**COLLEGE OF COMPUTING STUDIES**||**vi**|
|---|---|---|---|
||**LIST OF APPENDICES**|||
||**APPENDIX TITLE**|**Page**||
|A|Confidentiality and Non-Disclosure Agreement|138||
|B|Validated Research Instrument/s|139||
|C|Informed Consent Form|140||
|D|Research<br>Ethics<br>Review<br>Committee|141||
||Evaluation|||
|E|Short Report of Plagiarism Software|143||
|F|Report of Language Software|144||
|G|Bionote of Student Researchers|145||



**1** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **CHAPTER I** 

## **THE PROBLEM AND ITS SETTING** 

This study bridges the gap between logical thinking and executable Python code by designing and developing a hybrid pseudocode-to-Python code-generation system that addresses the common challenge of translating algorithmic reasoning into syntactically correct programs. This chapter lays the foundation for the study, outlining its purpose, scope, and beneficiaries. 

## **Introduction** 

In recent years, programming has become an important skill and ability not just in technology-related fields such as computer science and IT, but also in other fields such as business. With the development of digital tools, it is now possible for non-professionals to design software solutions. However, many students still find it difficult to understand programming despite its relevance. One of the biggest problems isn't grasping the reasoning of a problem, but translating that logic into code that works. Although students might try to design solutions step by step, applying them in Python is not so easy, because of tight requirements of syntax and style [1], [2]. 

And this leads to an important point: human problem-solving and machine execution are separate processes. Traditional programming education typically involves writing code right away, so students must manage logic, grammar, and debugging at the same time. Therefore, students tend to focus on addressing little problems like missing symbols or wrong indentation instead of building problem-solving skills. This can rapidly turn into confusion, distress and eventually a loss of motivation [3]. Pseudocode has been routinely 

**2** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

utilized to fill this void. It provides a mechanism for pupils to convey ideas in an organized yet flexible manner, using basic language without the stress of restrictive syntax rules. 

Focusing first on logic before syntax helps students comprehend how solutions are constructed, making the learning process more manageable and less daunting [4]. However, translating pseudocode to real code still is a problem. Syntax, indentation and control structures are typically a challenge for students because it is hard to know if problems are due to faulty logic or bad implementation. This hinders the progression and impacts the entire learning experience [5]. As technology advances, many automated code generation approaches have been developed, such as rule-based systems and artificial intelligence models [6], [4]. 

These programs can create code efficiently, but many are not meant for instructional use. They are generally black boxes and do not provide enough guidance to learners on how the code is generated. In order to overcome these issues, the research advocates the creation of a hybrid pseudocode to Python code generator. The system facilitates learning through rule-based translation, execution-based validation and adaptive feedback. It teaches students how to structure pseudocode and check the output, with the purpose of reducing coding errors, enhancing program accuracy and strengthening the relationship between logical thought and actual code. The eventual goal of the system is to provide a more structured and effective learning experience for the beginner coder. 

**3** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **Statement of the Problem** 

This study bridges the gap between algorithmic reasoning and executable programming syntax by designing and developing a hybrid pseudocode-to-Python code generation system. The system utilizes a rule-based translation approach supported by Context-Free Grammar (CFG) and Syntax-Directed Translation (SDT), combined with validation mechanisms to improve the correctness of generated programs. 

Specifically, the study seeks to answer the following questions: 

1. How does the application of Syntax-Directed Translation (SDT) influence the translation outcome of the Context-Free Grammar (CFG) in generating syntactically correct and executable Python code? 

2. How does the mapping model with a validation mechanism in the PseudoPy system improve the code generation compared to the traditional pseudocode-to-code methods in terms of: 

   - a. percentage improvement in code generation correctness; 

   - b. reduction in syntax and runtime errors; and 

   - c. faster code generation time? 

3. How does the hybrid model and transformation logic of algorithms in the PseudoPy system convert pseudocode into Python code, in terms of: code generation accuracy; 

   - a. syntactic correctness; 

   - b. semantic correctness; 

   - c. execution success rate; and 

   - d.  generation time? 

4. How can performance in automated pseudocode-to-code translation be evaluated using measurable metrics such as: 

   - a. Accuracy; 

**4** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF COMPUTING STUDIES**|
|---|
|b. precision;|
|c. compilation success rate;<br>d. execution time; and<br>e. runtime error rate?|
|5. What are the assessments of students and instructors regarding the<br>system in terms of:<br>a. usability;<br>b. learnability;|
|c. efficiency; and<br>d. reliability?|
|6. What is the level of evaluation of the proposed application by IT experts<br>based on the ISO 25010 quality criteria in terms of<br>a. functional suitability;<br>b. usability;<br>c. reliability;|
|d. performance efficiency;<br>e. maintainability; and<br>f. portability?|
|**Scope and Limitation**|



PseudoPy (Pseudocode-to-Python) is created as an automated logic interpretation using a rule-based mapping model using a transformer for educational tools, especially for academic environments. The intended users of this study are Computer Science students who learn logic formulation, instructors who need to evaluate student’s progress and automate solution keys, and researchers who analyze the efficiency of rule-based translation. The system is geographically planned to be deployed locally in university laboratories and personal student devices, as a Progressive Web Application to be accessible in locations with a lack of continuous internet connection. The development and evaluation were carried out during the 

**5** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Academic Year 2025-2026, and the main goal was to connect the gap between abstract logic and syntax-heavy programming via a **dynamic interpretation environment** providing rapid instructional feedback. Some of the key features include **integrated logic to execution pipeline,** intelligent keyword suggestions based on Levenshtein Distance algorithm, multi-role dashboard for students and administrators, learning analytics to track concept mastery and local code execution using Skulpt interpreter. 

The system consists of several integrated modules providing some functionality. **The Processing and Execution Engine** is the main module that handles lexical analysis, syntax parsing with recursive descent, semantic validation, and p **reparing the logic for interpretation by real-time Python.** The Metrics Engine is a formal evaluation module that computes accuracy, precision, recall and F1-score against a ground-truth dataset. The UI and Dashboard Module provides the responsive interface and role-based access management for user interaction. The Data Management Module provides offline persistence via localStorage and contains the benchmark test cases. 

The system allows offline operation and three modalities of pseudocode input for immediate conversion and execution. The offline feature system can run completely offline by moving Logic to be processed on the Client (browser), Data saved in LocalStorage, Runtime uses Skulpt (JS based on Python), Access uses Service Worker Cache from a remote server to the local device of the user. In PseudoPy this is achieved by a combination of Progressive Web App (PWA) technologies, client-side interpretation and local data persistence. 

The system also provides dynamic offline feedback through Static Program Analysis (SPA) by analyzing the Abstract Syntax Tree (AST) and Symbol Table instead of relying on hard-coded keywords. It performs syntactic, semantic, algorithmic, and logical analysis to detect structural errors, undeclared variables, inefficient algorithms, and differences between student solutions and instructor- 

**6** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

defined logic. This enables PseudoPy to generate intelligent and context-aware feedback entirely within the browser environment. 

The PseudoPy system functions as an offline-first **Progressive Web App (PWA)** that eliminates the need for a constant internet connection by utilizing a **4stage compiler pipeline** and a **local storage database** built directly into the browser. In a classroom setting, the system acts as a self-contained learning environment where instructors can manage exercises through a central dashboard, and students can solve logic problems with the help of a **dynamic refinement loop** that provides real-time, non-hard-coded feedback. Because the system leverages client-side libraries like **Skulpt** for Python execution and a **rule-based mapping model** to translate natural language into structured logic, it can be distributed as a simple web link or a portable folder, allowing students to access, solve, and track their algorithmic progress entirely on their own devices without ever needing a backend server. 

The system provides different file inputs, first is Manual Input, where students or instructors key in pseudocode directly into the system interface. The system can verify student logic against teacher reference solution and automatically grade the algorithm reliability using AST and EMA. The second is File-Based Input, which allows pseudocode to be submitted through uploaded documents in formats such as PDF, TXT, DOCX, and other appropriate file types. This feature allows students and teachers to **run and test logic** without requiring direct interaction with the system's text editor. The third is System-Provided Example Files where the system provides pre-built pseudocode templates and guided examples as educational references to show the correct structure and syntax of pseudocode to help students learn the required **logic patterns before execution.** 

However, the system has some limits beyond of the researcher's control despite its robust design. To guarantee 100% predictability and to prevent the hallucination problems that are typical in black-box AI models, the system is limited to 

**7** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

a pre-defined vocabulary of keywords. Additionally, **the system depends on clientside interpretation using Skulpt** , which may lead to worse performance compared to native settings because of the virtualization overhead needed for offline functionality. Finally, the system is logic-centric and does not support complicated Python libraries, file I/O, OOP, and complex Data Structures. The primary focus is on understanding core logic and control structures from the conventional computer science curriculum. 

## **Significance of the Study** 

This research is to present a method called “Translating Pseudocode and Python: An Algorithmic Approach to Automated Code Generation” which allows the systematic conversion of pseudocode generated by students into working Python code. The method is intended to improve the learner's algorithmic thinking, logical reasoning and comprehension of programming foundations. This research was done by the researchers and they intend to be helpful to the following: 

**Students** - The system improves the learning experience by reducing the need to memorize strict syntax rules and instead focusing on logical thinking and algorithmic understanding. The mapping model helps interpret different natural language variations into standardized programming commands, which reduces confusion and cognitive load during coding. Students benefit from improved code correctness through dynamic feedback, fewer syntax and runtime errors due to early detection and autocorrection, and faster learning cycles because the system reduces repetitive trialand-error debugging. Over time, this leads to measurable improvement in coding performance within a single learning session as errors decrease and successful outputs increase. 

**Educators -** the system provides a more intelligent way to observe and understand student learning behavior. To identify track and progress of the student more accurately, it is design more targeted instructional strategies based on actual student 

**8** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

performance data rather than just final outputs. It shifts the teaching approach toward a more adaptive and data-driven model of instruction. 

**Researchers** – the study contributes a hybrid framework that combines classical compiler design principles with modern natural language processing concepts. It demonstrates how lexical analysis, parsing, autocorrection, and syntax-directed translation can be integrated with a mapping model to improve educational programming systems. The system also provides empirical data through learning analytics, enabling further exploration of how semantic mapping reduces cognitive load and improves code comprehension and correctness. This makes the framework a useful reference for studies related to intelligent tutoring systems and programming education tools. 

**Future Researchers – T** he system serves as a scalable foundation that can be expanded with more advanced technologies such as machine learning-based semantic parsing or transformer-based language models. It also opens opportunities for extending the system into multi-language code generation and deeper adaptive learning analytics that can further personalize programming education. The modular structure ensures that each component can be enhanced independently while still maintaining system coherence. 

**Software Engineering and Tool Development** - the study demonstrates the effectiveness of combining multiple lightweight algorithms into a single educational compiler pipeline. The mapping model, implemented as a fast pattern-matching preprocessor, ensures minimal computational overhead while improving overall system efficiency. By reducing debugging cycles, minimizing errors before execution, and accelerating the transition from pseudocode to executable Python code, the system achieves improved development efficiency and faster generation time. Ultimately, the study contributes to a system that not only compiles code but also actively supports learning by interpreting intent, guiding correction, and measuring improvement in a structured and meaningful way. 

**9** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **CHAPTER II** 

## **REVIEW OF RELATED LITERATURE AND STUDIES** 

This chapter builds the intellectual groundwork for the study. It walks through existing literature directly relevant to the research, traces the theoretical foundations the study draws from, and maps out the conceptual framework that holds everything together. It also pulls together a synthesis of what prior work has already established and closes with key terms defined in the context in which they are actually used here. 

## **Conceptual Literature** 

## **Standard Features** 

The whole point of converting pseudocode to Python is not to make students write code from scratch; it is to meet them where they already are. Students can already think through a problem algorithmically; what trips them up is the moment syntax enters the picture. Traditional programming instruction tends to drop beginners straight into that syntax-heavy environment, which pulls attention away from the actual thinking and toward mechanical rule-following. A pseudocode-based learning system sidesteps that friction entirely by letting students first express solutions in a structured yet natural way. It gives them a cleaner path toward genuinely understanding how programming logic works, rather than just memorizing how it looks. [4] 

A well-designed pseudocode-to-Python conversion system is not just a translator — it is a full learning environment, and the features it includes should reflect that. At the center is a split-panel code editor: pseudocode on one side, generated Python on the other, both updating in real time. That side-by-side view is not just convenient, it makes the relationship between logic and code immediately visible, which is exactly the kind of feedback a beginner needs. Alongside that, the 

**10** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

system should let students run the generated Python code and see its output on the spot, no installations, no setup, no friction. 

Beyond the core editor, the system carries a few features that push it from useful to genuinely practical. Students should be able to download the works as an actual .py file, something they can keep, build on, and submit. There should also be an automated feedback tool that does not just flag errors, but explains them, catching structural issues like missing BEGIN or END markers, unbalanced control structures, and absent output statements, then offering a quality rating and concrete suggestions for improvement. 

On the instructor side, an exercise management module would let teachers create, edit, and assign programming tasks across difficulty levels, with or without attached solution keys. Moreover, tying it all together, role-based access control ensures that students, teachers, and administrators each interact only with the parts of the system relevant to them [3]. 

## **Guidelines for Using the Algorithms** 

The translation algorithm used in pseudocode-to-Python systems relies on a set of predefined rules that determine how each pseudocode statement is converted into its Python equivalent. The algorithm reads pseudocode one line at a time and matches each line against recognized patterns. Each statement must follow a specific structure for example, variable assignment must use the keyword SET followed by the variable name and the keyword TO, conditional statements must begin with IF and end with END IF, and loops must use FOR or WHILE with a closing END FOR or END WHILE. 

The algorithm also manages indentation automatically, increasing the indent level when entering a block and decreasing it when the block is closed. This is essential because Python uses indentation to define the scope of code. Operators such as AND, OR, NOT, and MOD are translated into Python equivalents, and 

**11** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

12oolean values like TRUE and FALSE are converted to True and False. If a line does not match any recognized pattern, the algorithm converts it into a comment rather than producing an error, so the remaining translated code stays intact. These guidelines ensure that students who follow the correct pseudocode structure will receive accurate and executable Python output [2]. 

There are several important things that is consider when developing this type of application. The translation algorithm is carefully designed to handle a wide variety of pseudocode constructs, including variable declarations, nested control structures, function definitions, and logical expressions. Proper indentation tracking is critical since Python depends on whitespace to define code blocks. The system also handle unexpected input gracefully converting unrecognized lines into comments rather than crashing or producing broken code. 

The choice of database technology matters as well; using a local host database allows real-time data access for storing user accounts, exercises, and student activity records without requiring a dedicated server. Developers also consider data security, particularly regarding how passwords and credentials are stored. Building the platform as a Progressive Web Application ensures it can be accessed across different devices and even installed as a standalone app, which improves accessibility for students who rely on mobile devices. Performance and reliability of the in-browser code execution engine must also be tested thoroughly, and a fallback mechanism should be in place in case the execution library fails to load [4]. 

## **User-Centric Design** 

User-centric design plays a vital role in ensuring that the system meets the needs of its intended users effectively. The interface should be intuitive and visually organized so that students can focus on learning rather than struggling to navigate the platform. Clear labeling of buttons and sections, logical page layouts, responsive 

**12** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

design for different screen sizes, and immediate visual feedback such as success notifications when code is translated or error alerts when execution fails all contribute to a smoother and more engaging user experience [5]. 

## **Testing Tools and Procedure** 

Testing is equally important; usability testing with actual students and instructors helps identify confusing workflows and missing features that may not be obvious during development. Functional testing verifies that all features including translation, execution, exercise management, and user administration work correctly across different scenarios and edge cases. By combining user-centric design principles with thorough testing practices, developers can build a system that is not only technically functional but also genuinely effective as a learning tool for students at different skill levels [5]. 

## **Research Literature** 

## **Review of Related Literature** 

The purpose of this chapter is to examine how previous studies and technologies address similar problems, identify research gaps, and establish the importance of the current study in relation to existing work. Additionally, this chapter provides the conceptual foundation and supporting guidelines that will help shape the development of the proposed solution. 

## **Difficulties of Programmers** 

The field of programming and software development continues to evolve, especially with the integration of artificial intelligence and Natural Language Processing (NLP). Today, it is important for students to understand the logic and step- 

**13** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

by-step process of solving problems before translating them into actual code. Pseudocode plays a key role in this process, as it allows learners to express algorithms using simple, human-readable language. 

Related studies show that NLP and machine learning can be used to process textual data and convert it into meaningful outputs such as code. This highlights the growing potential of automated systems in simplifying programming tasks, particularly for beginners who are still developing logical and coding skills. 

One of the main challenges in programming education is the difficulty students face in translating pseudocode into actual programming languages like Python. Since pseudocode is not standardized and is often written in natural language, it becomes hard to interpret and convert into executable code. This gap between understanding logic and writing code can slow down the learning process. 

Additionally, beginners often struggle with syntax, structure, and proper implementation of programming concepts. Even if they understand the algorithm, they may not know how to express it correctly in a programming language. This creates a need for tools or systems that can assist in bridging the gap between logical thinking and code implementation. 

And in some cases programmers struggle not primarily due to syntax errors, but because they cannot clearly visualize how algorithms operate or translate them into correct program structures. Research indicates that beginners often fail to properly sequence steps, apply control structures appropriately, or anticipate program flow, resulting in flawed logic and non-working programs even when syntax is correct [1]. 

These challenges are frequently described as weaknesses in algorithmic thinking, wherein students have difficulty decomposing problems, designing step-bystep solutions, and mapping those solutions into executable structures [2]. 

**14** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Identified several contributing factors to these outcomes, including ineffective instructional strategies, students’ prior misconceptions, and the inherently abstract nature of programming concepts. Butler and Morgan [2], [3] emphasized that conceptual and strategic knowledge—such as understanding program design, control flow, and the interaction between programming constructs—poses greater difficulty for novices than mastering syntactic rules. They further observed that students often receive detailed feedback on syntax errors but limited guidance on higher-level logical reasoning, thereby reinforcing shallow learning focused on code details rather than overall algorithm structure [3]. 

Van Merriënboer and Sweller [4] extended this perspective through cognitive load theory, arguing that novices’ working memory becomes overloaded when required to simultaneously manage syntax, logic, and problem decomposition. 

Algorithmic thinking is widely recognized as a foundational skill in programming education [5]. When students lack this foundation, they encounter difficulties converting informal problem descriptions into structured algorithms and ultimately into working code [1], [5]. To address these issues, researchers have proposed various pedagogical models and technological interventions, including structured problemsolving frameworks, visualization tools, and educational programming environments that promote stepwise refinement and repeated algorithm design practice [5], [6]. However, Butler and Morgan [6] cautioned that technology alone is insufficient to resolve these learning challenges without corresponding improvements in instructional methods and curriculum design. 

**15** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **Pseudocode as a Pedagogical Tool** 

Pseudocode is commonly used in computer science education as a languageindependent method for expressing algorithms, allowing students to focus on logical structure rather than strict syntax [1]. By minimizing language-specific constraints, pseudocode enables learners to concentrate on problem decomposition, control structures, and data flow [4]. Acharjee [4] argues that algorithmic thinking taught through pseudocode creates cognitive scaffolding that transfers across programming languages and paradigms. 

Olsen [8] described a teaching approach in which students first learn to write pseudocode from problem statements and later convert it into source code, resulting in improved pseudocode quality and deeper understanding of computational concepts. In a qualitative analysis of student work, Olsen [8] observed that pseudocode-first instruction helped learners internalize structural patterns before confronting language-specific syntax requirements. 

Despite these benefits, transitioning from pseudocode to executable code remains challenging for many novices [1]. The manual process of mapping pseudocode constructs into language-specific syntax can be time-consuming and error-prone, particularly in languages such as Python that impose strict indentation rules and precise syntactic forms for control structures [9], [10]. Practical guides emphasize that although pseudocode may clearly express logical intent, the translation step introduces opportunities for syntactic errors that may obscure whether the underlying algorithm is correct [9]. Similarly, common beginner mistakes during translation include incorrect loop boundary implementation and improper conditional nesting [10]. 

Some researchers argue that while pseudocode promotes conceptual clarity, students require structured scaffolding during translation to actual code to prevent reliance on trial-and-error practices that weaken algorithmic reasoning [6], [10]. For 

**16** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

inexperienced programmers, identifying and correcting logical flaws—also referred to as semantic errors—can be particularly frustrating. Improving instructional methods by identifying prevalent and challenging logical errors may reduce student frustration and enhance learning outcomes. 

To address these challenges, educators have proposed integrating tools that directly link pseudocode and executable code, enabling students to visualize the correspondence between algorithmic steps and actual program statements [5], [11]. The BBC Open Source pseudocode parser project [11] demonstrates an institutional approach to automating translation while providing immediate feedback and reinforcing proper control flow patterns. Such systems can assist learners in verifying whether the intended algorithmic logic is accurately reflected in the resulting executable code. 

## **Automated Pseudocode-to-Code Generation** 

Recent studies in programming education explore automated translation between pseudocode and source code to improve program comprehension. One approach focuses on generating pseudocode from source code to help developers understand program logic. For instance, Oda et al. [8] used statistical machine translation to automatically generate pseudocode summaries from source code, which can assist in explaining large codebases in a language-independent way. 

Other studies examine the reverse process, where pseudocode is translated into executable code. Xu et al. [9] proposed an improved model for pseudocode-tocode conversion that balances both efficiency and generation quality. Zhong, Stern, and Klein [10] also introduced the concept of semantic scaffolds, which use intermediate structural representations to guide the code generation process and improve syntactic accuracy. 

**17** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Additionally, search-based systems such as SpoC [11] refine generated programs by exploring alternative code candidates and validating them through test cases. This approach significantly improves the success rate of pseudocode-to-code synthesis and is particularly useful in educational settings where students may need multiple iterations to correct logical errors. 

## **Review of Related Studies** 

## **Competency-Based Assessment of Programming Skills in Higher Education** 

Luxton-Reilly et al. [32] conducted a systematic review of introductory programming literature spanning over 15 years, examining trends in how students learn to program across four areas: the student, teaching, curriculum, and assessment. The review found that traditional assessments tend to measure students’ ability to write syntactically correct code rather than deeper capacity for algorithmic reasoning and problem decomposition. The authors highlighted that novice programmers frequently struggle not with syntax rules alone, but with higher-order skills such as code tracing, debugging, and algorithm design — competencies that standard exam formats often fail to capture. The review further noted the growing need for tools and instructional approaches that explicitly target algorithmic thinking rather than relying on code correctness as the primary measure of learning. This is directly relevant to the current study, as the proposed pseudocode-to-Python system addresses precisely this gap — by requiring students to design algorithmic logic in pseudocode before any syntax is involved, it shifts the focus from surface-level code production to genuine problem-solving competency. 

**18** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **Based to Text-Based Programming Transition Tools.** 

Weintrop and Wilensky [33] examined the experiences of high school students transitioning from block-based programming environments such as Scratch to textbased languages such as Python. Using a mixed-methods design with 120 students across three schools, the researchers compared three transition approaches: direct switching with no scaffolding, teacher-mediated scaffolding, and a hybrid block-text editor that displayed both representations simultaneously. Findings revealed that students using the hybrid tool demonstrated a 31% lower rate of syntax errors in first text-based projects and reported significantly higher confidence scores on postsurveys. Qualitative interviews indicated that seeing the visual block representation alongside the text equivalent helped students construct a mental bridge between visual logic and formal code syntax. The study concluded that transition tools that make the correspondence between visual or informal representations and formal code explicit are more effective than abrupt switches or verbal instruction alone. The relevance of this study to the current research is direct: the pseudocode-to-Python system proposed here operates on an analogous bridging principle. Just as the hybrid block-text editor allowed students to see both representations simultaneously, the proposed system shows students the given pseudocode alongside the generated Python translation, making the mapping between algorithmic intent and syntactic form visible. Weintrop and Wilensky’s findings support the hypothesis that this kind of sideby-side correspondence display reduces errors and builds conceptual confidence in novice programmers. 

## **Automated Feedback Systems in Introductory Programming Courses.** 

Keuning, Jeuring, and Heeren [34] conducted a systematic evaluation of automated feedback tools deployed in introductory programming courses across seven European universities, covering over 2,400 students and 18 distinct tools. The 

**19** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

study analyzed the types of feedback provided (syntactic, semantic, and conceptual), the frequency of student interaction with feedback, and the correlation between feedback engagement and final course performance. Results demonstrated that tools providing multi-level feedback — covering not only syntax errors but also logical structure and algorithm quality — were associated with a 22% improvement in assignment completion rates and a 17% improvement in exam performance compared to tools providing only syntax-level feedback. The researchers also found that feedback which guided students toward understanding why an error occurred, rather than simply identifying what was wrong, led to significantly fewer repeated errors in subsequent tasks. The study recommended that future automated programming tools move beyond error detection toward explanatory and generative feedback that supports deeper algorithmic reasoning. This study directly informs the design rationale of the proposed system. The finding that multi-level, explanatory feedback outperforms syntax-only correction aligns with the system’s design goal of helping students observe execution output, compare it with expected results, and iteratively refine the pseudocode. The proposed system’s process of translation-executioncomparison operationalizes the type of reasoning-oriented feedback that Keuning et al. identified as most effective for novice programmers [34]. 

## **Theoretical Background** 

This study is anchored on three primary theoretical foundations: Constructivism, Cognitive Load Theory, and Syntax-Directed Translation. These theories provide the framework for understanding how students learn programming and how the proposed pseudocode-to-Python translation system supports that learning process. 

**20** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
sara<br>[imersonse of Pseudocode-Systm<br>IDT/CFG Eng<br><!-- End of picture text -->

Figure. 1. Theoretical Framework 

## **Constructivism** 

Constructivism, initially developed by Piaget and later expanded by Vygotsky, posits that learners actively construct knowledge by integrating new experiences with prior understanding rather than passively receiving information [1], [2], [4]. In programming education, this implies that students develop algorithmic thinking by designing pseudocode, predicting program behavior, and reflecting on execution outcomes instead of merely memorizing syntax rules [5], [19]. Constructivist learning environments emphasize learner control, experimentation, and reflection, allowing students to refine mental models through iterative practice and feedback [1], [3]. The proposed Pseudocode-to-Python system operationalizes constructivist principles by providing an interactive workspace where students is the author of the pseudocode, translate it to Python, and immediately observe the resulting program behavior. By iteratively revising pseudocode in response to execution and error feedback, learners engage in cycles of experimentation and reflection that support deep conceptual understanding rather than rote syntax recall [18], [31]. 

**21** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **Cognitive Load Theory** 

Cognitive Load Theory (CLT), introduced by Sweller, states that human working memory has limited capacity and that learning is enhanced when extraneous cognitive load is minimized so that more resources can be devoted to essential processing [6], [7]. CLT distinguishes intrinsic load (complexity inherent to the material), extraneous load (imposed by presentation and interface design), and germane load (effort invested in schema construction and automation) [6], [8]. Research in programming education shows that novice programmers often experience high extraneous load because they must simultaneously manage problem analysis, algorithm design, programming language syntax, and debugging activities [11], [7]. This overload can hinder the development of robust mental models for core programming concepts [18], [31]. The proposed system aims to reduce extraneous load by automating the syntactic translation from structured pseudocode to Python. By allowing students to focus on expressing algorithms in constrained pseudocode while the tool handles boilerplate syntax and formatting, more cognitive resources can be allocated to intrinsic aspects such as control structures, data flow, and problem decomposition [18]. The dual visualization of pseudocode and generated Python, together with immediate feedback on execution and errors, is expected to foster germane load by supporting schema formation for basic programming patterns [6], [31]. 

### **Syntax-Directed Translation and Context-Free Grammar** 

In SDT, attributes are associated with grammar symbols, and semantic rules specify how these attributes are computed during parsing, enabling systematic conversion from source constructs to target code [28], [14]. CFGs provide a formal model for defining the syntactic structure of programming languages, allowing parsers to construct abstract syntax trees that capture the hierarchical organization of control statements, expressions, and declarations [28], [14]. The proposed Pseudocode-to- 

**22** 



<!-- Start of picture text -->
Gniversity of Cabupao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Python system adopts a CFG-based SDT scheme to ensure that student-written pseudocode is syntactically valid before translation. The lexer first tokenizes the input, and the parser then attempts to derive the token sequence from the start symbol using predefined production rules. When a valid parse tree is constructed, attached semantic actions generate equivalent Python constructs with correct indentation and structure. This formalization guarantees that each pseudocode pattern (e.g., conditional, loop, function-like block) is mapped to a predictable Python template, enabling consistent translation and reliable automated feedback on syntax errors [16], [28], [14]. 

## **Conceptual Framework** 



<!-- Start of picture text -->
© Students submit * Lexical analysis tokenizes * Algorithmic Code<br>each input (ON) regex Generation from<br>© CFG parsing builds AST Python<br>caei matching);{stack-based validation) » PseudocodeValidated Python to<br>* Instructors provide * SDT generates Python code (py<br>exercises stored in tree (traversal, OW), Aowmided) qustty<br>Firestore (USERS, Skulpt executes code, ora<br>EXERCISES checks output vs. (syntax/execution/<br>colesra expected, refines via logic %)<br>Levenshtein distance on ® Activity logs for<br>* Instructor's Expert mappings (dynamic instructors.<br>Logic Biueprint/ programming matrix); +: Soamokied<br>Correct logic feedback analyzes errors Foutheck aitogec<br>pei + LogicGap Analysis halts :<br>+ Root Cause Identification i <carnatmance hel<br>+ Alignment Score Deshboerd<br><!-- End of picture text -->

### **Figure 2. Conceptual Framework of the Proposed System** 

The framework of this study bridges the gap between algorithmic thinking and executable Python code by integrating Cognitive Load Theory and Constructivism on the pedagogical side, and Context-Free Grammar (CFG) and Syntax-Directed 

**23** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Translation (SDT) on the technical side. At the input stage, students submit structured pseudocode through a split-panel editor—an approach rooted in Cognitive Load Theory that reduces the mental burden of syntax memorization and allows learners to focus on logical reasoning. Constructivism further supports this stage by treating pseudocode writing as an active knowledge-building process, with instructors providing structured exercises that scaffold learners' progression toward programming proficiency. 

At the process and output stages, CFG governs pseudocode validation via Lexical Analysis and AST-based parsing, ensuring that all input is structurally sound before translation begins. SDT then drives the actual conversion in Python by embedding semantic actions directly into the grammar rules, handling Python's strict indentation and block-structure requirements throughout the derivation tree. The system further refines its output through execution-based validation and Levenshtein distance mapping, ultimately producing validated Python code, a quality score, and instructor activity logs. Together, these four foundations ensure that the system functions not only as a technically rigorous translation engine but also as a pedagogically meaningful tool that supports beginner programmers in bridging the gap between logical thinking and correct coding. 

## **Synthesis** 

The study intends to use a rule-based translation algorithm and context-free grammar to apply systematic pseudocode-to-Python conversion for both writing and executing code, giving students a more structured and guided learning procedure. The study will use a syntax-directed translation approach as its conversion strategy, where the generated Python code will be precisely mapped from the student's pseudocode constructs, ensuring that the logical intent of the student is accurately reflected in the executable output. To support deeper algorithmic thinking and reduce cognitive burden, the study seeks to automate syntax handling and indentation management so that students can focus to mental effort entirely on problem-solving and algorithm 

**24** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

design. The researchers constructed a conceptual framework that is supported by a theoretical foundation to serve as the guide for the study's development and implementation. The theoretical background provides the basis for understanding how students learn programming, particularly through the lens of Constructivism, Cognitive Load Theory, and Syntax-Directed Translation. At the same time, the conceptual framework identifies the system's key inputs, processes, and outputs. Compared to traditional instruction where students must manually translate pseudocode into Python, the proposed system offers a more efficient and scaffolded learning experience, allowing students to observe algorithmic logic become executable code while receiving immediate feedback that reinforces understanding of programming concepts. 

## **Definition of Terms** 

This section provides clear definitions of important words and concepts used throughout this study to avoid ambiguity and improve the clarity and accuracy of the discussion. These are separated between operational and conceptual terms to ensure readers share a common understanding of the terms as used in this study, which may differ from general or dictionary meanings. 

## **Conceptual Terms** 

## **Terms** 

## **Conceptual Foundation** 

## **Functions** 

## **Definition** 

The basic principles, theories, and core ideas that support understanding and learning in a particular  field,  such  as  programming concepts and logic [1]. 

Reusable blocks of code designed to perform a specific task, which can accept inputs and 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLL**|**EGE OF**|**COMPUTING STUDIES**<br>return outputs [5].<br>A neural network-based model trained on vast|
|---|---|---|
|**Large**<br>**Language**<br>**(LLM)**|**Model**|text corpora that can generate, understand,<br>and  manipu-  late  human  language  and<br>code[15].|
|||The set of rules that defines the structure and<br>arrangement of symbols and statements in a|
|**Syntax**||programming language [1].|
|**Variables**||Named storage locations in a program that<br>hold data values which can be changed<br>during|
|||program execution [5].|
|**Operational Terms**|||
|**Terms**||**Definition**|
|||The proposed system functions similarly to a<br>compiler by taking pseudocode as input and<br>translating it into Python code. However, unlike|
|**Compiler**||traditional compilers that target machine code,<br>this system targets a high-level language while<br>applying compiler techniques such as lexical<br>analysis and parsing [8].|
|**Automation**||Describes the mechanisms lexical analysis,<br>parsing, translation and what the system|



## **25** 

**26** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

||does  for  users  automatically  converts, provides<br>feedback[2].<br>CFGs provide the theoretical foundation for|
|---|---|
||parsing<br>pseudocode<br>and<br>defining<br>valid|
|**Context-Free**<br>**Grammar**<br>**(CFG)**|algorithmic structures before translation [1]. The<br>system implements a CFG specifically designed<br>for educational pseudocode, ensuring that only<br>syntactically correct inputs are processed and<br>translated [3], [6].<br>Pseudocode functions as the primary input format<br>for users of the system. Students write the<br>algorithmic solutions using simple, structured|
|**Pseudocode**|language that resembles but is simpler than<br>actual programming code. The system then|
||processes<br>this<br>pseudocode<br>to<br>generate|
||<br> <br> <br>executable Python programs [26].<br>Python serves as the target output language of|
||the translation system. When users input<br>pseudocode, the system generates equivalent|
|**Python**|Python code that can be executed to verify<br>algorithmic correctness. Python is chosen due to|
||itssyntax similarity to pseudocode and its|
||extensive built-in methods that simplifytranslation<br>[22].<br>Syntax-Directed Translation (SDT) is a compiler|
|**Syntax-Directed**<br>**Translation (SDT)**|design approach in which semantic actions are<br>attached to grammar productions so that<br>translation is driven by the structure of a Context-<br>Free Grammar (CFG) [28].|



**27** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **CHAPTER III** 

## **RESEARCH METHODOLOGY** 

. This chapter presents the methodological framework of the study, outlining the research design, locale, and participants. It further describes the procedure for algorithm development, the instruments used for data collection, their validity and reliability, the scoring and interpretation of responses, and the ethical considerations observed throughout the conduct of the research. 

## **Research Design** 

This study is anchored on a quantitative research design, employing structured online surveys as the primary instrument for numerical data collection. The investigation focuses on three key areas: first, the system's proficiency in translating structured pseudocode into executable Python code through the application of rulebased algorithms, Context-Free Grammar, and Syntax-Directed Translation; second, the effectiveness of the validation mechanism in ensuring code correctness through execution-based checking and iterative refinement; and third, the system's capacity for performance improvement over time by drawing from previously validated translations. Syntax accuracy, execution success rate, and logical correctness serve as the primary performance metrics. Feedback from students and instructors is also collected to evaluate the system in terms of usability, learnability, efficiency, and reliability. The resulting data are analyzed using frequency counts, percentages, and weighted means. 

## **Research Locale** 

The study will be conducted at the University of Cabuyao, also known as Pamantasan ng Cabuyao, located in Katapatan Mutual Homes, Barangay Banaybanay, in the City of Cabuyao, Laguna. We chose this university because it fits the 

**28** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

goal of the study. In the College of Computing Studies, Python is already a familiar language among students; it is also part of advanced computing subjects across different fields, especially for third-year students in both the Bachelor of Science in Computer Science and Bachelor of Science in Information Technology programs. These students are required to learn Python to solve increasingly complex problems as they progress, while also learning new languages. For this reason, this study is conducted at the University of Cabuyao. 

## **Respondents of the Study** 

Third-year Computer Science and Information Technology students, CCS Faculty Teachers/Instructors, and IT Experts at the University of Cabuyao and outside University of Cabuyao serve as the respondents. The study will have a total of 30 respondents, consisting of 18 third-year Computer Science and Information Technology students, 6 CCS Faculty Teachers/Instructors, and 6 IT Experts. This sample size is considered sufficient to produce dependable evaluation results within manageable limits. 

The foundational concepts, such as pseudocode writing and algorithmic thinking, equip the third-year Computer Science and Information Technology students with the prerequisite knowledge to engage substantively with the system. However, the selection of third-year students was purposive and carefully considered based on the required skills of the students. At this stage of their academic journey, students have typically been exposed to problem-solving logic, but some continue to struggle to express that logic in Python syntax. That's the challenge the system is trying to address and improve. This combination of prior knowledge and existing learning needs makes third-year Computer Science and Information Technology students suitable participants for this study. CCS Faculty Teachers/Instructors and IT Experts are also included to provide professional and technical evaluation of the system. 

**29** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Researchers will utilize purposive sampling to define the sample size of the  study. Purposive sampling represents a non-probability sampling technique that  selects participants through specified characteristics or expertise related to their  research objectives [44]. 

|**Category**|**No. of Respondents**|
|---|---|
|3<sup>rd</sup>Year Computer Science and Information|18|
|Technology Students||
|CCS Faculty Teachers/Instructors|6|
|IT Experts|6|
|**Total**|**30**|



Table 1. Number of Respondents. 

## **Data Gathering Procedures** 

The data collection for this study will be carried out in three stages: pre-data gathering, actual data gathering, and post-data gathering. **Pre-Data Gathering Phase** . First, the researcher must secure the necessary permissions to proceed with the study. The researcher will send a formal request letter, signed off by the research adviser, to the Dean of the College of Computing Studies at the University of Cabuyao. Once the Dean gives the green light, the researcher will request the official enrollment list of third-year BSCS and BSIT students to determine the appropriate population and sample size. At the same time, computing experts will review the survey instrument to ensure it measures what it is supposed to measure and is ready before it reaches the respondents. **Actual Data Gathering Phase** . With the validated instrument in hand, the researcher will administer the survey to the selected third-year students. Whether through Google Forms or printed copies, the survey will be administered at a time that 

**30** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

works best for the respondents so it does not disrupt regular class schedules. Before anyone answers a single question, they will receive an Informed Consent form explaining the study and making it clear that participation is entirely voluntary—no pressure whatsoever. Post-Data Gathering Phase. Once the collection period wraps up, all responses will be gathered, tallied, and encoded for processing. In keeping with the Data Privacy Act of 2012 (R.A. 10173), any personal information collected will be handled with strict confidentiality — stored safely and used only for this academic study. The compiled data will then undergo statistical treatment, analysis, and interpretation. 

### **Instrumentation** 

The main data-collection tool in this study is a researcher-made questionnaire distributed through Google Forms. This straightforward and accessible platform makes it easy to reach respondents online. A paper-based survey is also prepared as a backup option for those who may have trouble with digital access. 

The questionnaire is designed to gather three key types of information: how accurate the system’s generated Python code is, how well the system performs overall, and what students and instructors think about using it. 

As for who fills it out, respondents were chosen through simple random sampling from the pool of third-year BSCS and BSIT students at the University of Cabuyao, giving every eligible student a fair and equal chance of being selected. 

### **Validation** 

After the data analysis has categorized the data gathered, it will undergo external validation to ensure the accurate measurement of the instrument; the following validation will be used; 

**31** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

**Face validation.** Validators (e.g., faculty members/IT experts) review the questionnaire to check clarity, grammar, and readability for the target respondents. The researcher revises the wording, removes ambiguous items, and improves instructions based on the validators’ comments. 

**Content validation.** The same validators evaluate each item’s relevance and alignment with the study objectives and variables using a validation checklist or rating sheet (e.g., relevance, clarity, and appropriateness of indicators). Items that receive low ratings are revised or removed, and the final set of items reflects the operational indicators of [IV/DV]. 

**Pilot testing and reliability.** The revised Google Form is pilot-tested with selected students similar to the target respondents but not included in the final sample. The pilot responses are used to check internal consistency (e.g., Cronbach’s alpha), and items that reduce reliability are revised or omitted before final administration. 

### **Data privacy and form settings** 

The Google Form is designed to minimize personal data collection and to keep responses confidential (e.g., avoiding unnecessary identifiers, limiting access to the response sheet, and storing files in a secured account/drive). The study includes informed consent and follows the Data Privacy Act of 2012 (Republic Act No. 10173) for lawful and transparent processing of any collected information. 

**32** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **Discussions on Algorithms/Mathematical Concepts Used/Proposed Solutions** 

## **Fundamentals of the Algorithms/Mathematical Model/Formula** 

The proposed system, PseudoPy, uses a hybrid language-processing approach that combines transpilation and browser-based interpretation, Dynamic Programming for intelligent feedback generation via the Levenshtein Distance algorithm, Rule-Based Pattern Matching for natural language normalization, and Sequential Processing for efficient linear execution of core operations. Together, these paradigms enable structured translation, adaptive error feedback, and efficient system performance. 

Syntax-Directed Translation (SDT) serves as the compiler engine's primary paradigm, processing pseudocode according to its grammatical structure and systematically transforming it into Python code through recursive traversal of its logical representation. Dynamic Programming is applied in the Levenshtein Distance algorithm to optimize spelling correction and suggestion generation by decomposing word comparison into subproblems and storing intermediate results in a matrix for efficient computation. Rule-Based Pattern Matching is used in the natural language mapping module, where user inputs are matched against predefined patterns and transformed into standardized pseudocode constructs, enabling consistent and structured interpretation of flexible input. Sequential Processing is employed in both lexical analysis and search operations, where data is processed linearly from start to finish, ensuring computational efficiency with O(n) time complexity and supporting fast execution even on low-resource devices. 

## **Theoretical Foundations** 

**33** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

The design and implementation of the PseudoPy system are grounded in computational and educational theories that support structured translation, adaptive feedback, and effective learning. 

The Sequential Parsing and Stack-Based Validation components operationalize the principles of Context-Free Grammar (CFG) by enforcing structural correctness in pseudocode inputs. Through a recursive descent parsing approach, the system verifies that input conforms to defined grammatical rules. The use of a LIFO stack ensures correct nesting and closure of control structures such as loops and conditionals, enabling reliable and deterministic syntax validation. 

The Levenshtein Distance mechanism supports principles of Constructivist Learning Theory by encouraging students to actively identify and correct errors. Instead of providing generic syntax errors, the system computes similarity between user input and valid keywords to generate targeted suggestions. This promotes an iterative refinement process where learners reconstruct their understanding through guided correction. 

The Natural Language Mapping module and Engines are designed in accordance with Cognitive Load Theory. By allowing human-like input expressions that are automatically translated into structured pseudocode, the system reduces extraneous cognitive load associated with strict syntax requirements. This enables learners to focus more on algorithmic logic rather than syntactic precision, thereby improving conceptual understanding. 

The PseudoPy system addresses the syntax barrier in computer science education by introducing a deterministic, rule-based pseudocode-to-Python translation engine grounded in Context-Free Grammar (CFG), ensuring consistent and reproducible outputs. It enhances learning through a validation-driven refinement process that acts 

**34** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

as an automated feedback loop, enabling iterative correction and logical verification of student input. The system also reduces cognitive load by allowing learners to focus on problem-solving rather than programming syntax, while providing learning analytics such as algorithm complexity analysis to reinforce computational thinking. 

## **Algorithm Design** 

The PseudoPy system integrates a hybrid set of algorithms that collectively support pseudocode translation, syntax validation, and intelligent feedback generation. It is built on a language processing framework that combines lexical analysis, syntactic and semantic validation, and code generation to convert pseudocode into executable Python code. The Sequential Parsing Algorithm processes input in a strict linear manner, reading and analyzing the source code step by step while preserving the logical flow of the program. The Stack-Based Syntax Validation Algorithm ensures structural correctness by verifying the proper pairing and nesting of control structures such as IF and END IF through a Last-In, First-Out (LIFO) mechanism, thereby preventing unclosed or mismatched blocks during parsing. The Levenshtein Distance Algorithm, implemented using dynamic programming, is utilized to compute the similarity between user input and valid keywords, enabling the system to generate intelligent suggestions for misspelled or partially incorrect commands. In addition, the Linear Search Algorithm is applied during semantic analysis to locate identifiers, keywords, and mapping rules within stored data structures, ensuring accurate validation of declared variables and system-defined terms. Together, these algorithms form a cohesive computational framework that enhances both the correctness and usability of the translation system. 

## **Mathematical Model Formulation** **_(If Applicable)_** 

**35** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

The syntax validation and translation process of the system is formally modeled using a Context-Free Grammar (CFG) combined with Syntax-Directed Translation (SDT). The CFG defines the structural correctness of pseudocode, while SDT specifies how valid structures are translated into Python code. 

A Context-Free Grammar is defined as a 4-tuple: 



where: 

- 𝑉 is the set of non-terminal symbols (e.g., Program, Statement, Expression) 

- Σis the set of terminal symbols (e.g., BEGIN, IF, THEN, END) 

- 𝑅 is the set of production rules that define valid syntactic structures 

- 𝑆 is the start symbol representing a complete pseudocode program 

Within the system, CFG serves as the formal specification of the pseudocode language. Each valid input must conform to a set of production rules 

𝑃𝑟𝑜𝑔𝑟𝑎𝑚 → 𝐵𝐸𝐺𝐼𝑁 𝑆𝑡𝑎𝑡𝑒𝑚𝑒𝑛𝑡𝐿𝑖𝑠𝑡 𝐸𝑁𝐷 

- 𝐼𝑓𝑆𝑡𝑎𝑡𝑒𝑚𝑒𝑛𝑡 → 𝐼𝐹 𝐶𝑜𝑛𝑑𝑖𝑡𝑖𝑜𝑛 𝑇𝐻𝐸𝑁 𝐵𝑙𝑜𝑐𝑘 𝐸𝑁𝐷 𝐼𝐹 

In the PseudoPy system, the implementation of Context-Free Grammar (CFG) serves as the formal mathematical foundation that ensures the correctness, consistency, and predictability of the pseudocode-to-Python translation process. The grammar follows the formal definition G=(V,Σ,R,S), which is operationalized through six key computational processes within the compiler engine. The first process is **Terminal Identification through Lexical Analysis** , which corresponds to the identification of terminal symbols (Σ) — the fundamental units of the grammar, including keywords, operators, identifiers, and literals. The lexical analyzer scans the input pseudocode and classifies each token into its corresponding predefined 

**36** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

category, such as BEGIN, IF, arithmetic operators, and numeric values. Such classification ensures that only grammatically valid symbols are passed on to subsequent stages of the translation pipeline, establishing a clean and well-defined token stream as the basis for further processing. 

The second process is **Production Rule Enforcement through Recursive Descent Parsing** . The production rules (R) define the complete set of valid syntactic structures permissible within the language. These rules are operationalized through a recursive descent parser, in which each parsing function corresponds directly to a specific grammar rule. For instance, a conditional statement must conform to the prescribed structure: IfStmt → IF Condition THEN Block [ELSE Block] END IF. The parser validates the token sequence against these rules, and any structural deviation triggers a syntactic error, ensuring that only grammatically well-formed pseudocode proceeds through the system. 

The third process is **Non-Terminal Derivation through Abstract Syntax Tree (AST) Construction** . Non-terminal symbols (V) represent higher-level language constructs such as Program, Statement, and Expression. During parsing, these abstractions are progressively expanded and organized into an Abstract Syntax Tree, which provides a hierarchical representation of the program's structure. The AST captures the relational dependencies between constructs, including block nesting and scope boundaries, thereby enabling accurate semantic analysis and code generation in the stages that follow. 

The fourth process is **LIFO Block Validation through Stack Management** . To enforce proper nesting of block structures, the system employs a Last-In, First-Out (LIFO) stack mechanism. Each time a block-opening construct — such as IF or WHILE — is encountered, it is pushed onto the stack. Removal only occurs upon identification of the corresponding closing construct, such as END IF or END WHILE. Such a mechanism guarantees that all control blocks are correctly matched and hierarchically 

**37** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

nested in accordance with the grammar rules, preventing structural ambiguity in complex or deeply nested programs. 

The fifth process is **Deterministic Look-Ahead through Predictive Parsing** . The parser incorporates a look-ahead mechanism that allows the system to inspect upcoming tokens without consuming them. Such capability enables the parser to determine the appropriate production rule to apply, particularly in cases where multiple rules share similar prefixes. By resolving potential ambiguities before token consumption, predictive parsing ensures deterministic rule selection and consistent parsing behavior throughout the translation process. 

The sixth process is **Sentinel Enforcement through Structural Delimiters** . Certain reserved keywords function as sentinels that define structural boundaries within the grammar. Keywords such as THEN in conditional statements and DO in iterative constructs explicitly delimit conditions from their corresponding executable blocks. These markers ensure clarity in the parsing process and prevent the misinterpretation of program structure, reinforcing the unambiguous application of grammar rules across all syntactic constructs. 

To enforce proper nesting of control structures, a **stack-based mechanism (LIFO)** is used alongside the CFG. This ensures that every opened construct is correctly closed in reverse order, preventing structural ambiguity in nested statements. 

Building upon CFG, the system applies **Syntax-Directed Translation (SDT)** to associate semantic actions with production rules. Each rule is augmented with translation instructions that define how pseudocode constructs are converted into Python code. For instance, a production rule for a conditional statement includes an action that generates the equivalent Python if statement with proper indentation and syntax. 

**38** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

The system uses a structured and rule-based process based on SyntaxDirected Translation (SDT) to convert pseudocode into executable Python code. This method ensures that the output is consistent and logically correct. The translation process is divided into seven stages, each designed to handle a specific part of the conversion. 

The process starts with input acquisition, where the user submits pseudocode through the system interface. This input serves as the basis for the entire translation process. Since users may write pseudocode in different styles, the system performs normalization to standardize the input. In this stage, informal or varied expressions are converted into a consistent set of predefined pseudocode keywords to avoid ambiguity. 

After normalization, the system performs lexical analysis or tokenization. The input is broken down into smaller units such as keywords, identifiers, and operators. This helps the system understand the components of the pseudocode. The system may also detect minor errors in spelling and suggest corrections. Next, syntax parsing is carried out to analyze the structure of the tokens. A stack-based approach is used to ensure that all control structures are properly matched, which helps maintain correct program structure. 

Once the structure is verified, the system performs semantic validation to check the logical correctness of the pseudocode. This includes verifying variable usage, checking data types, and ensuring that operations are valid. Errors such as undeclared variables or incorrect operations are identified at this stage. After validation, the system proceeds to code generation, where the pseudocode is translated into equivalent Python code. Each construct is converted into its proper Python syntax to produce an executable program. 

Finally, the system includes a refinement and feedback loop. The generated code is compared with a reference solution provided by the instructor. The system 

**39** 



<!-- Start of picture text -->
Gniversity, , of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

identifies any logical differences and provides feedback to the user. This allows the user to improve their pseudocode and repeat the process, supporting continuous learning and development. 

### **Sequential Parsing Algorithm (Pseudocode)** 



<!-- Start of picture text -->
// Stage 1: Pattern Matching (Mapping)<br>FOR EACH mappingRule IN globalRules DO<br>IF trimmedLine matches mappingRule.pattern THEN<br>translatedLine = REPLACE trimmedLine WITH mappingRule.result<br>BREAK loop<br>END IF<br>END FOR<br>// Stage 2: Tokenization and Generation<br>tokens = BREAK translatedLine INTO individual words/symbols<br>pythonCode = CONVERT tokens TO Python syntax<br>APPEND pythonCode TO ovtputBuffer<br>END FOR<br>RETURN outputBuffer<br><!-- End of picture text -->

### **Stack Based Syntax Validation Algorithm** 

**40** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
ALGORITHM ValidateBlockStructure(tokens)<br>stack = EMPTY stack // LIFO structure<br>FOR EACH token IN tokens DO<br>IF token IS a starting keyword (BEGIN, IF, WHILE, FOR) THEN<br>PUSH token.type ONTO stack<br>ELSE IF token IS an ending keyword (END, END IF, END WHILE) THEN<br>IF stack IS empty THEN<br>RETURN ERROR "Unexpected END statement"<br>END IF<br>topOfStack = POP from stack<br>IF topOfStack DOES NOT match token. type THEN<br>RETURN ERROR "Block mismatch: Expected END " + topOfStack<br>END IF<br>END IF<br>END FOR<br>IF stack IS NOT empty THEN<br>RETURN ERROR "Unclosed block: " + stack.top<br>END IF<br>RETURN SUCCESS<br>END<br><!-- End of picture text -->

### **Levenshtein Distance Algorithm (Dynamic Programming)** 

**41** 



<!-- Start of picture text -->
Gniversity, , of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
ALGORITHM LevenshteinDistance(word1, word2)<br>m = LENGTH of wordt<br>fn = LENGTH of word2<br>matrix = 20 ARRAY of size (m+1) x (n+1)<br>FOR i FROM © TO m DO matrix[i](o] = i<br>FOR 4 FROM © TO n DO matrix(O][4] = 4<br>FOR 4 FROM 1 TO m DO<br>FOR j FROM 1 TO n 00<br>IF wordi{i-1] == word2[j-1] THEN<br>cost = 0<br>ELSE<br>cost = 1<br>END IF<br>matrix[i}[j] = MINIMUM OF (<br>matrix(i-1][j] + 1, // Deletion<br>matrix{iJ[j-1] + 1, // Insertion<br>matrix{i-1]{j-1] + cost // Substitution<br>)<br>END FOR<br>END FOR<br>RETURN matrix{m][n]<br>END<br><!-- End of picture text -->

### **Linear Search Algorithm** 



<!-- Start of picture text -->
ALGORITHM LinearSearch(dataList, targetValue)<br>FOR EACH item IN datalist 00<br>IF item.identifier EQUALS targetValue THEN<br>RETURN item // Record found<br>END IF<br>END FOR<br>RETURN NULL // Record not found after O(N) traversal<br>END<br><!-- End of picture text -->

**42** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **Algorithm Implementation** 

This analysis details the technical architecture and implementation of the PseudoPy (Pseudocode-to-Python) translation engine which employs a Syntax-Directed Translation (SDT). 

|**Stage**|**Process**|**Logic and Implementation**|
|---|---|---|
|**0. NLP Mapping**|mapper.js|Uses RegEx patterns to<br>normalize<br>natural<br>language (e.g.,_"ask for x"_)<br>into standard terminals<br>(_"INPUT x"_).|
|**1. Lexical Analysis**|Lexer|Scans text in**O(N) linear**<br>**time**to generate tokens. It<br>separates keywords,<br>identifiers,  literals,  and<br>operators.|
|**2. Syntax Analysis**|Parser|Uses**Recursive Descent**<br>to build an Abstract Syntax<br>Tree (AST). It employs a<br>**LIFO stack**to validate<br>nestedblocks<br>(IF/WHILE/FOR).|
|**3.Semantic Analysis**|Semantic Analyzer|Performs<br>"context<br>sensitive"<br>checks,<br>verifying that variables are|



**43** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|||declared before use and<br>checking for mathematical|
|---|---|---|
|**4. Code Generation**|CodeGenerator|A   tree-walker   that<br>converts AST nodes into<br>Python strings, handling<br>indentation and mapping<br>operators (e.g., MOD to<br>%).|



## **Table 2.  Pseudocode Transition Engine** 



<!-- Start of picture text -->
Input: Pseudocode P<br>Step 1: Lexical Analysis<br>tokens ¢ tokenize(P)<br>Step 2: Syntax Parsing<br>AST € parse(tokens using CFG)<br>IF error THEN<br>RETURN “Syntax Error”<br>Step 3: Initial Code Generation<br>code ¢ generate Python from AST (SDT)<br>Step 4: Execution Validation<br>result ¢ execute(code®)<br>Step 5: Check Correctness<br>If result is correct THEN<br>store mapping (P > code@)<br>RETURN codeO<br>Step 6: Refinement (Core Contribution)<br>candidates < generateAlternativeMappings(P)<br>FOR EACH code_i IN candidates DO<br>result_i € execute(codei)<br>IF result_i is correct THEN<br>store mapping (P > code_i)<br>RETURN code_i<br>END FOR<br>Step 7: Failure Handling<br>RETURN best attempt + feedback<br><!-- End of picture text -->

**44** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

The system incorporates several mechanisms to enhance translation accuracy and user learning. It utilizes the Levenshtein Distance algorithm to perform intelligent keyword correction by identifying minimal differences between user input and valid pseudocode terms, enabling the system to suggest appropriate corrections. Additionally, a validation-driven refinement mechanism is implemented through an automated correction loop that detects structural inconsistencies, such as unclosed blocks, and attempts to resolve them before reprocessing the input. The system also includes a static analysis feature that estimates time complexity by evaluating loop nesting depth, allowing classification of algorithms into standard Big O notations such as 𝑂 (1), 𝑂 ( 𝑛 ), and 𝑂 ( 𝑛<sup>2</sup> ). 

The generated Python code is executed using the Skulpt interpreter, enabling in-browser execution without requiring external dependencies. This allows the system to function offline while maintaining a complete compilation and execution pipeline within the browser environment. 

The system also implements translation through a rule-based mechanism that defines a direct correspondence between pseudocode constructs and their Python equivalents. These mappings are applied during the code generation phase, where each node of the Abstract Syntax Tree (AST) is traversed and converted into Python syntax. 

**45** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **Pseudocode-to-Python Keyword Mapping Table** 

The system uses predefined translation rules to convert pseudocode keywords into Python constructs, as shown below: 

|**Pseudocode Construct**|**Python Equivalent**|
|---|---|
|BEGIN|(start of block / indentation)|
|END|(end of block / dedentation)|
|IF condition THEN|if condition:|
|ELSE|else:|
|FOR I = 1 TO n|for i in range(1, n+1):|
|WHILE condition DO|while condition|
|PRINT value|print(value)|
|INPUT variable|input()|
|SET x = value|x = value|
|RETURN value|return value|



### **Table 3. Keyword Mapping Table** 

### **Tree-Walk Code Generation** 

The Code Generator traverses the Abstract Syntax Tree (AST) constructed during the CFG parsing phase through a process known as a Tree-Walk. For every node encountered during this traversal, the SDT defines a corresponding mapping action that specifies how that construct is to be rendered in Python. For instance, when the system encounters an **AssignmentStatement** node representing the pseudocode construct **SET x TO 10** , the SDT mapping rule instructs the generator to extract the identifier, append an assignment operator, and append the translated expression, producing the Python output **x = 10** . This rule-governed process guarantees that every 

**46** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

recognized pseudocode construct is mapped to a predictable and consistent Python equivalent. 

Example Translation Process: 



<!-- Start of picture text -->
Recognition : AssignmentStatement node » SET x TO 10<br>Mapping Rule : Identifier + '=' + Expression<br>Output : x = 10<br><!-- End of picture text -->

### **Indentation Management** 

The system manages Python indentation through an attribute-based mechanism during code generation. When the Code Generator enters a block-level construct such as an IF or WHILE statement, the indent_level attribute is incremented, causing all nested statements to be generated with additional indentation. When the block ends, the attribute is decremented to restore the previous indentation level. 

This mechanism ensures that all generated Python code follows proper whitespace formatting rules, preventing syntax errors caused by incorrect indentation and maintaining compatibility with Python’s block structure requirements. 

### **CFG and SDT in the Translation Pipeline** 

The CFG and SDT components operate as interconnected stages within the translation pipeline, where each stage contributes to transforming pseudocode into executable Python code 

|**Stage**|**Concept**|**Role in the system**|
|---|---|---|
|Parsing|CFG|Checks if pseudocode follows|
|||correct grammar rules|



**47** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|AST Building|Structural Representation|Builds a hierarchical structure of<br>the program|
|---|---|---|
|Code Generation|SDT|Converts AST nodes into Python syntax|



### Table 4. Transition Pipeline 

As shown in the pipeline, CFG ensures that the input follows valid syntactic rules before processing continues. Once validated, the system constructs an Abstract Syntax Tree (AST) that represents the logical structure of the program. Finally, SDT applies translation mappings during AST traversal to convert each node into its corresponding Python syntax. The integration of CFG and SDT within this pipeline ensures a deterministic and structured translation process, enabling consistent conversion from pseudocode to Python while preserving logical correctness. 



<!-- Start of picture text -->
[START]<br>↓<br>[Input Student Pseudocode (P_s)]<br>↓<br>[Lexical Analysis]<br>↓<br>[Syntax Parsing (CFG)]<br>↓<br>Syntax Error?<br><!-- End of picture text -->

**48** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF COMPUTING STUDIES**|
|---|
|├── YES → [Display Syntax Feedback] → [END]|
|└── NO|
|↓<br>────────────────────────────────────────|
|<br>[EMA + LGA INTELLIGENCE MODULE]<br>────────────────────────────────────────|
|<br>↓|
|[1. Multi-Stage Syntax Normalization]|
|→ Convert P_s → Tokens_s|
|→ Convert Instructor Logic (P_i) → Tokens_i|
|↓|
|[2. Dual AST Generation]|
|→ Generate Student Tree (T_s)|
|→ Generate Instructor Tree (T_i)|
|↓|
|AST Error in T_s?|
|├── YES → [Return Syntax-Level Feedback] → [END]|
|└── NO<br>↓|



**49** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF COMPUTING STUDIES**|
|---|
|[3. Semantic Pattern Matching]|
|→ Identify patterns (loops, conditions, etc.)|
|→ Align variables (e.g., sum ↔ total)|
|↓|
|[4. Logic Gap Analysis (LGA)]|
|→ Detect Missing Logic (nodes in T_i not in T_s)|
|→ Detect Misplaced Logic (wrong structure)|
|↓|
|[5. Mastery Score Calculation]|
|→ Precision|
|→ Recall|
|→ F1 Score (M)|
|↓|
|[6. Generate Pedagogical Hints (H)]<br>────────────────────────────────────────|
|<br>↓|
|[Generate Python Code (C) using SDT]|
|↓<br>[Execute Code]|





<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF COMPUTING STUDIES**|**50**|
|---|---|
|↓<br>Output Correct?||
|├── YES → [Store Mapping (P_s → C) + M + H] → [END]||
|└── NO||
|↓||
|[Generate Alternative Code]||
|↓||
|Correct?||
|├── YES → [Store Mapping (P_s → C) + M + H] → [END]||
|└── NO||
|↓||
|[Return Best Attempt + Feedback]<br>→ Include:||
|• Generated Code (C)||
|• Mastery Score (M)||
|• Logic Gap Feedback (H)<br>↓||
|[END]||
|The system processes student pseudocode through lexical analysis and||
|syntax parsing using CFG. The system ensures the accuracy and correctness of||



**51** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

student solutions by using the **instructor-defined pseudocode (Pᵢ)** as the ground truth reference for evaluation. Instead of relying solely on final output, the system performs **multi-level validation** combining structural, semantic, and execution-based checks. If valid, it performs deeper analysis using AST comparison, semantic matching, and Logic Gap Analysis to evaluate correctness and generate a mastery score with feedback. It then translates the pseudocode into Python and executes it. If execution fails, the system enters a **refinement loop** , attempting alternative mappings to auto-repair the code and return the best possible output with feedback. Along with this to provide intelligent and fully offline feedback, the system performs Static Program Analysis by analyzing the program’s Abstract Syntax Tree (AST) and Symbol Table instead of relying on simple keyword matching or regular expressions. Through components implemented in app.js and compiler.js, the system dynamically evaluates code structure, variable usage, logic flow, and algorithmic behavior to generate context-aware suggestions such as detecting deep nesting, undeclared variables, type mismatches, redundant statements, and structural differences from instructor solutions. The system also supports validation-driven refinement, where it automatically generates and tests possible corrections for syntax errors before suggesting fixes to the learner, enabling more adaptive and non-hard-coded feedback within the offline compiler environment. 

In addition, the system incorporates a root cause analysis mechanism to identify failures in pseudocode processing and code generation. Errors are primarily attributed to syntax issues during parsing, ambiguities in Abstract Syntax Tree (AST) construction, semantic or logical gaps in the student’s solution, limitations in syntaxdirected translation (SDT) mappings, and runtime execution faults. To address theFIse, the system employs a refinement loop that utilizes alternative mapping strategies to automatically repair invalid or incomplete pseudocode. This approach ensures that, instead of terminating on failure, the system produces a best-effort code output accompanied by diagnostic feedback and suggested corrections, thereby improving both system robustness and instructional effectiveness. 

**52** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

This section demonstrates how the PseudoPy system processes actual input data through a step-by-step execution of the translation pipeline using a sample pseudocode problem: 

Example: Sum of Even Numbers 

### **1. Input (Pseudocode)** 

The system receives the following pseudocode from the user: 



<!-- Start of picture text -->
BEGIN<br>SET numbers TO [2, 5, 8, 11]<br>SET sum TO 0<br>FOR EACH num IN numbers DO<br>IF num MOD 2 = © THEN<br>SET sum TO sum + num<br>END IF<br>END FOR<br>DISPLAY "Total: " + sum<br>END<br><!-- End of picture text -->

### 2. **Lexical Analysis (Tokenization)** 

The lexer converts the input into a sequence of terminal symbols representing keywords, identifiers, and operators used by the grammar. 

### **3. Stage 2: Syntax Analysis (AST Mapping)** 

The Parser applies the CFG rules to build a hierarchical tree. Internally, the structure looks like this: 

Program 

AssignmentStatement (id: "numbers", expr: "[2, 5, 8, 11]") AssignmentStatement (id: "sum", expr: "0") ForEachStatement (iterator: "num", list: "numbers") 

**53** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Body: 

IfStatement (condition: "num % 2 == 0") 

Body: AssignmentStatement (id: "sum", expr: "sum + num") PrintStatement (expr: '"Total: " + sum') 

### **4. Stage 3: Semantic Inspection** 

The Semantic Analyzer checks the tree for logic safety: 

Check: Is sum declared/initialized before being used in sum + num? Yes. Check: Is num declared? Yes (implicitly by the FOR EACH loop). 

Result: Logic verified as "Safe." 

### **5. Stage 4: Code Generation (Python Output)** 

The Generator produces the final, executable Python code: 

# Generated by PseudoPy numbers = [2, 5, 8, 11] 

sum = 0 

for num in numbers: if num % 2 == 0: 

sum = sum + num print("Total: " + str(sum)) 

### **6. Stage 5: Real-time Execution (Interpretation)** 

The Skulpt Interpreter runs the Python code above and displays the final result in the system console: 

Console Output: Total: 10 

**54** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **Complexity Analysis** 

The researchers evaluate the algorithms in terms of efficiency and practicality to support the teaching of basic algorithm concepts. This includes analyzing their time and space complexities and scalability to ensure effective visualization of core algorithm behaviors within the system. 

## **Time Complexity** 

The system is designed to ensure fast execution, enabling students to obtain results in real time, even on low-performance devices. The Sequential Parsing Algorithm operates with a time complexity of O(n), where the execution time increases linearly with the number of input lines. This is achieved by processing the code in a single pass from start to finish without re-evaluating previously read statements, thereby maintaining efficient performance. Similarly, the Stack-Based Syntax Validation Algorithm also operates in O(n) time complexity by scanning each token once to verify the correct pairing of control structures such as IF and END IF. For searching operations within user records or exercises, the system employs a Linear Search Algorithm with O(n) complexity, which remains efficient due to the relatively small dataset size stored locally. In addition, the Levenshtein Distance Algorithm, used for spelling correction and suggestion generation, operates with a time complexity of O(m × n). Although computationally more intensive, it is applied only to short string comparisons, allowing it to execute efficiently in practice. 

### **Space Complexity** 

The system is optimized to minimize memory consumption to ensure smooth performance within a browser-based environment. During translation, the Sequential Parsing stage constructs an Abstract Syntax Tree (AST), which requires O(n) space proportional to the size of the input code. The Stack-Based Syntax Validation mechanism utilizes O(d) space complexity, where d represents the depth of nested 

**55** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAQO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

control structures. Since typical student inputs involve shallow nesting, memory usage remains minimal in practice. The Linear Search Algorithm operates with O(1) space complexity, as it does not require additional data structures beyond a single traversal pointer. Meanwhile, the Levenshtein Distance Algorithm requires O(m × n) space due to the construction of a comparison matrix; however, this remains negligible in practice because it is applied only to short text inputs. 

## **System Development Methodology** 

The proposed study Bridging Pseudocode and Python: An Algorithmic Approach to Automated Code Generation will be developed using the Agile Scrum methodology. This approach uses repeated cycles and iterative approach, focusing on continuous development, testing, and system enhancements through short, focused cycles called sprints. For a system where translation rules and validation processes demand constant tweaking and refinement, this approach proved ideal [35]. 



<!-- Start of picture text -->
¢ as<br>manenin (neenrnin) ED<br><!-- End of picture text -->

## **Figure 3: Agile Process Model** 

**56** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **Phases of Agile Methodology** 

The first stage, the **Initialization Phase,** established the foundational groundwork of the project. During this phase, the research team defined the core research problem bridging pseudocode and Python through rule-based translation and validation and identified the primary system goals, which included measurable metrics, offline capability, adaptive feedback, and educational usability. The Scrum team was formally organized, consisting of four Bachelor of Science in Computer Science researchers assigned to specific roles, namely the Product Owner, Scrum Master, and Developers. A Product Backlog was subsequently created, enumerating all required system features including the Lexical, Syntax, Semantic, Code Generation, and Feedback modules, as well as metrics tracking, offline functionality, and documentation and conversion analysis components. The output of this phase was a clear and structured roadmap of system requirements and sprint objectives that guided all subsequent development activities. 

The second stage, the **Planning and Estimation Phase** , focused on defining sprint goals and estimating workload distribution. Sprint Planning Meetings were conducted to select backlog items for each sprint cycle, and task complexity was estimated using a story points scale ranging from one to five. Tasks were assigned to team members based on individual expertise in areas such as algorithm design, user interface development, and software testing. Each sprint was set to a fixed duration of two weeks, with measurable goals established for each cycle: Sprint 1 targeted Lexical and Syntax Analysis; Sprint 2 addressed Semantic Analysis and Code Generation; Sprint 3 focused on the Execution and Feedback Module; and Sprint 4 covered the Metrics Dashboard and Offline Mode implementation. The resulting output of this 

**57** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

phase was a detailed Sprint Plan containing timelines, task assignments, and clearly defined expected deliverable 

In the proposed system, the researchers used UML Diagrams to clarify how the system was constructed in more detail. The proposed system used Use Case 

Diagram to determine: 



<!-- Start of picture text -->
<r<br>=N<br>Cae<br>$ y <><br>| cee<br><!-- End of picture text -->

### **Figure 4. Use Case Diagram** 

**58** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAQO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Shows who uses the system and what they can do. It identifies three actors Student, Instructor, and Admin and maps each one to the specific features. For example, Students can write pseudocode, translate it, and attempt exercises; Instructors can manage exercises and view analytics; Admins can manage user accounts and execute code. 



<!-- Start of picture text -->
<i eit —i——<br>om| * Guam<br>a ss<br>oid or)<br>— =<br><!-- End of picture text -->

**Figure 5. Activity Diagram for Pseudocode to Python Translation** 

This technical UML activity diagram illustrates the **internal processing steps of the system** when converting pseudocode into executable Python code. After the user submits pseudocode, the system first validates its syntax. If the syntax is incorrect, an error message is displayed, and the user is prompted to revise the pseudocode. If the pseudocode passes the validation stage, the system performs lexical analysis to identify tokens, followed by syntax parsing to verify the structure of the pseudocode statements. The system then conducts semantic analysis to determine whether the logic and meaning of the statements are valid.The system also checks for logical errors that may affect program execution. If logical errors are detected, they are displayed to the user for correction. If no errors are found, the 

**59** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

system generates the Python code, executes the program, and displays the output to the user. The user may then choose to save or download the generated code. 



<!-- Start of picture text -->
[System|<br><3<br>=<br>——"s<br>a<br>®<br>©<br>@<br><!-- End of picture text -->

### **Figure 6. Activity Diagram for Code Execution** 

This activity diagram illustrates the interaction between the user and the system. The system then verifies whether the pseudocode syntax is valid. If the syntax is invalid, the system displays an error message prompting the user to edit or rewrite the pseudocode before resubmitting it. The system then checks for logical errors. If it 

**60** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

detects logical errors, the system displays an error message and allows the user to revise the pseudocode. If no logical errors are found, the system generates the corresponding Python code. The system then executes the generated code and displays the output to the user. Finally, the user verifies whether the output is correct. If the result is correct, the user may save or download the generated Python code. Otherwise, the user can modify the pseudocode and repeat the process. 



<!-- Start of picture text -->
[User| Roleenum|<br>Username INSTRUCTOR<br>FullName ADMIN<br>Email<br>Role [__ Exercise |<br>Exercieel<br>Title<br>Difficulty<br>ExpectedPseudocode<br>Delete()<br>tea<br>ActionType Translate() RunPython()<br>Timestamp ParseCondition() HandleOutput()<br>CodeSnippet Applyindentation() HandleError()<br>Analyze() OveraliScore<br>— Suggestions<br><!-- End of picture text -->

### **Figure 7. Class Diagram for the Proposed System** 

Shows the structure and relationships of the system's core components. It includes classes like User Exercise ActivityLog, TranslationEngine, CodeExecutor, and FeedbackAnalyzer with the attributes, methods, and how they relate to each other 

**61** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

- (e.g., a User creates ActivityLog records; TranslationEngine feeds code to CodeExecutor). 



<!-- Start of picture text -->
[ee]<br>Se -—<br>=<br>*String status sanalyzeStructure()<br>ound +checkSyntaxfalance()<br>Se,+String sitficulty ‘PreudccodsToPythionipseudocode)<br>: ,<br>ron :<br>(code)<br>=nd<br><!-- End of picture text -->

### Figure 8. Class Diagram 

The class diagram represents the logical structure of the PseudoPy system. It shows the main objects (classes), properties (attributes), behaviors (methods), and their connections. The system is built around three user types: Student, Instructor, and Admin, each with its own permissions. Users interact with Exercises created by Instructors, and every action they take is recorded in an ActivityLog. 

**62** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
USERS |<br>wale<br>t A<br>ACTIVITY_LOGS<br><!-- End of picture text -->

Figure 9. ER Diagram — Firestore Data Model 

The Firestore database has three collections. USERS stores account information for all roles (Student, Instructor, Admin). EXERCISES stores tasks created by Instructors and links them back to the user who created them. ACTIVITY_LOGS records every action (translation, execution, exercise attempt) that a user performs, referencing both the user and the exercise involved. 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

**COLLEGE OF COMPUTING STUDIES 63 Figure 10. System Architecture Diagram** The system runs entirely in the browser; no backend server is needed. Index.html provides the UI, while app.js handles all logic, including the TranslationEngine, CodeExecutor, and FeedbackAnalyzer. Data is stored and retrieved from Firebase Firestore (cloud database). Python code execution uses Skulpt, loaded from a CDN. A Service Worker (sw.js) enables offline/PWA support by caching the app locally. The third stage, the **Implementation Phase** , was the system's core development period, executed through a series of iterative sprints. Development activities involved implementing rule-based translation using Context-Free Grammar and Syntax-Directed Translation principles, while testing activities validated pseudocode samples for syntax accuracy, runtime error rate, and execution success. Daily Standup meetings were held to maintain team alignment and discuss progress bal 

**64** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

address blockers. Feedback from panel evaluators was systematically integrated, particularly recommendations pertaining to conversion analysis, error handling improvements, and scope definition. Documentation was updated after each sprint to record algorithm workflow refinements and mathematical model adjustments. The cumulative outputs of this phase included working system increments delivered after each sprint, updated documentation reflecting conversion analysis and error-handling improvements, and enhanced modules supporting adaptive feedback and offline code execution. 

The fourth and final stage, the **Release Phase** , finalized the system and prepared it for deployment and formal evaluation. Sprint Review sessions were conducted to present completed features to the panel and gather structured feedback, while Retrospective meetings allowed the team to reflect on sprint performance and identify areas for further improvement. The system was subsequently packaged as a Progressive Web Application to support offline use and deployed for evaluation with third-year programming students. Usability testing was conducted, and evaluation metrics including accuracy, precision and recall scores, runtime error rate, and execution time were systematically measured and analyzed. Documentation was further refined to include complete conversion examples illustrating the full pipeline from word problem to pseudocode to Python code to output. The final outputs of this phase were the fully deployed version of PseudoPy, an evaluation report documenting measurable system improvements, and revised documentation demonstrating the system's transparency, error-handling capabilities, and clearly defined operational scope. 

**65** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **Statistical Treatment of Data** 

## **Population and Sampling** 

**T** his study involved Bachelor of Science in Computer Science students and Information Technology students at Pamantasan ng Cabuyao, mainly those who were taking or had finished introductory programming courses. These students were selected because they have basic programming skills and are the primary users of pseudocode and Python programming language. Student’s knowledge background allowed them to use the system, complete programming tasks, and provide helpful feedback on its features and learning support. 

The total number of people comes directly from the official enrollment records of the College of Computing Studies, specifically for the third year. Slovin's formula is then used to find the smallest sample size needed, with a 5% margin of error. It's an easy choice for a group of people that is already well-defined and easy to reach. 

Purposive sampling is used to choose who from that group will take part. Students were picked because they had experience with programming languages such as Python, Java, or JavaScript. To be eligible, a student must be officially in third year and taking advanced computing or major subjects this semester. It's making sure that the people who are judging the system have enough information to perform a task, provide feedback and experience as well as to check if it will be beneficial for programming education. 

Through purposive sampling, the study ensured that all selected participants were appropriate users who could provide meaningful feedback. This approach allowed the researchers to evaluate how effectively the system delivers adaptive programming exercises, generates automated feedback, and supports the improvement of programming skills, logical reasoning, and proper code structure. 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**CO**|**LLEGE OF COMPUTING STUDI**|**ES**|
|---|---|---|
|**Statistic**|**Formula/Example**|**Use Case**|
|Weighted Mean|xˉ=∑fx∑f\bar{x} = \frac{\sum f x}{\sum<br>f} xˉ=∑f∑fx|<br>Usability (e.g.,<br>3.4=Agree)|
|Frequency %|(f / n) × 100|Number of Respondent|
|Cronbach's α|Internal consistency|Questionnaire validation|
|Slovin's n|n = N / (1 + N (0.05)²)|Sample<br>sizing|



## **66** 

Table 5. Formula Table 

### **Evaluation and Scoring** 

Responses are collected through the Google Forms questionnaire and automatically recorded in the linked Google Sheets file. After the data collection period, the responses are checked for completeness (e.g., required items are answered) and are screened for invalid entries (e.g., duplicate submissions if email-collection is enabled, or clearly inconsistent responses). All accepted responses are then prepared for statistical treatment by coding each Likert choice into its corresponding numerical value. 

`Each item in the questionnaire uses a Likert scale and is scored numerically to allow computation of descriptive statistics. 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

**COLLEGE OF COMPUTING STUDIES 67** For a **4-point Likert scale** , the scoring uses: Strongly Agree 4 Agree 3 Disagree 2 Strongly 1 Table 6. Likert Scale If the instrument includes negatively worded statements, reverse scoring is applied before analysis. For a 4-point Likert scale, the scores are reversed as follows: 4 becomes 1, 3 becomes 2, 2 becomes 3, and 1 becomes 4. Item scores are then aggregated to compute (a) the mean per statement and (b) the composite mean per construct or variable (the average of all items under that construct). The analysis uses descriptive statistics to interpret the respondents’ evaluation of each construct measured by the Google Form. • Frequency and percentage are used to describe the respondent profile (e.g., BSCS vs. BSIT, section). • Weighted mean (mean) is used to summarize Likert responses per item and per construct. Tt where x is the numerical score per response and n is the number of respondents. | 

**68** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

To interpret the computed means, the study uses fixed ranges aligned with the **4-point Likert scale** : 

**Mean Range Verbal Interpretation** 3.26 - 4.00 Strongly Agree 2.51 - 3.25 Agree 1.76 - 2.50 Disagree 1.00 - 1.75 Strongly Disagree 

### **Table 7. Evaluation Criteria** 

The results of the weighted mean will be used to determine the overall performance of the system based on the selected criteria from ISO/IEC 25010:2011. Each category (usability, functional suitability, and performance efficiency) will be evaluated separately and interpreted accordingly 

The handling and storage of the Google Forms responses follow the Data Privacy Act of 2012 (Republic Act No. 10173), ensuring that collected information is processed for academic purposes and kept confidential. 

**69** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **Ethical Considerations** 

Ethics isn't a formality in this study — it's a foundation. Because the research involves real students and educators engaging with a system designed to shape how they learn, we handle every step with that responsibility in mind. Before anyone participates, we obtain informed consent —and not just as a signature on a form. Participants are walked through what the study is trying to do, how the process works, what risks exist (if any), and what they stand to gain. That conversation happens before any commitment is made, because agreeing to something you do not fully understand is not really consent. 

We keep any personal information collected along the way strictly confidential. The system is also designed with this in mind—it does not collect or process data in ways that could compromise anyone's privacy or cause harm. We did a lot of research, and there are three things that we always kept in mind: we respect the people who are part of the research and let them make their own decisions; we are honest about what we are doing; and we follow the rules that are in place to make sure everything is fair. 

The main goal of our research is not just to find answers, but to add something valuable to the field and do it well. We want to create something that is not just useful but also worth doing. Research is a part of this, and we want to do it the right way 

**70** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **CHAPTER lV** 

## **Results and Discussions** 

This chapter presents the results of applying, implementing, testing, and evaluating the proposed PseudoPy system, an automated pseudocode-to-Python translation system that bridges algorithmic reasoning and executable programming syntax. The discussion is organized according to the study objectives stated in the Statement of the Problem. It presents the influence of Syntax-Directed Translation (SDT) and Context-Free Grammar (CFG) in generating syntactically correct, executable Python code; the effectiveness of the maandg model and its validation mechanism compared to traditional pseudocode-to-code methods; and the application of the hybrid model and transformation logic in converting pseudocode into Python code. 

The chapter also presents evaluation results from end users and IT experts. End-user feedback focuses on the system's Usability, Learnability, Efficiency, and Reliability, while IT experts assess the system based on functional suitability, Usability, Reliability, performance efficiency, Maintainability, and Portability. These evaluations provide additional assessment of the translation system's performance, Usability, and overall quality. 

Furthermore, this chapter discusses how the PseudoPy system addresses the identified problems through its translation, mapping, validation, and transformation processes. The results are presented and interpreted according to each specific problem of the study to determine the effectiveness of the proposed system and the extent to which the research objectives have been achieved. 

**71** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **1.Application of Syntax-Directed Translation and Translation Outcomes** 

The first specific problem is applying Syntax-Directed Translation (SDT) in the proposed system, which influences the translation outcome of the Context-Free Grammar (CFG) by using structures recognized through CFG production rules as the basis for generating corresponding Python code. The CFG establishes which pseudocode structures are valid, while SDT associates each recognized structure with a specific translation rule. When the Parser recognizes a valid CFG production, the resulting structure in the Abstract Syntax Tree (AST) is processed by the SDT CodeGenerator and transformed into its corresponding Python construct. Therefore, SDT influences how the structures established by the CFG are transformed into syntactically corresponding Python code. 

The relationship between CFG and SDT in PseudoPy is evident in the system's translation pipeline. The CFG is formally represented as G = (V, Σ, R, S); as mentioned in Chapter 3, V represents the non-terminal symbols, Σ represents the terminal symbols, R represents the production rules, and S represents the start symbol. The proposed system's non-terminal symbols include Program, Statement, Block, and Expression, while terminal symbols include keywords such as BEGIN, END, IF, THEN, WHILE, DO, FOR, SET, and DISPLAY. These grammar components establish the structural rules that the input pseudocode must follow. SDT then uses the structures recognized through these rules to determine how each valid construct should be represented in Python. 

**72** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
[sete<br>eein<br>=<br>[severe fF |.<br><!-- End of picture text -->

Figure 11. System Algorithm Flowchart 

The first stage supporting this relationship is lexical analysis, implemented in Vanilla JavaScript (ES6+). The Lexer examines the pseudocode input and classifies its elements into tokens such as keywords, identifiers, numbers, strings, and operators. These tokens correspond to the CFG's terminal symbols and give the Parser the information it needs to select the appropriate production rule [45]. The Lexer also handles operator mappings required during translation, including converting pseudocode operators into their Python equivalents. Correctly identifying these tokens provides the input needed for CFG recognition and subsequent SDT translation. 

The second stage is syntax analysis, where the recursive-descent Parser enforces the CFG and constructs the AST [46]. Each recognized production rule corresponds to an AST node. Conditional statements, loops, assignments, and other 

**73** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

supported structures are represented according to their defined node types. The Parser also applies sentinel keyword validation and a LIFO block stack to verify that structures are properly formed and nested. Required keywords must be present, and closing constructs must match their corresponding opening blocks. Through these mechanisms, the CFG provides a reliable structural representation for the SDT process. 

The AST serves as the direct bridge between the CFG and SDT [46]. After the Parser validates the pseudocode against the CFG, it stores the recognized structures in a tree-based representation. This lets the CodeGenerator traverse the same structures without reinterpreting the original pseudocode. The AST preserves the structural relationships established during parsing and provides the information required for code generation. This way, decisions made during CFG recognition carry forward to the SDT translation stage. 

SDT applies directly during code generation [45]. The CodeGenerator uses a visitor-pattern tree walker that applies a translation rule to each AST node type [46]. Each node has a corresponding Python representation, allowing the system to transform the validated pseudocode structure into Python code. The exprToStr() function also translates expressions and operators into their Python equivalents. This demonstrates the nuance: SDT-recognized SDT grammar is not simply validated; the CFG forms the basis for producing the corresponding Python constructs. 

SDT also affects the structural correctness of the generated Python through indentation management [45]. Pseudocode uses explicit closing keywords to represent blocks, whereas Python uses indentation to establish block hierarchy. During code generation, the system maintains an indentation level that increases when it enters a block and decreases after it processes the block. Consequently, the system transforms nested CFG structures in the AST into appropriately nested structures. 

**74** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Python statements. When a block contains no executable statement, the system can insert a pass statement to prevent an empty Python block. This translation mechanism preserves the structural relationships that the CFG recognizes in the generated Python code. Semantic analysis provides another supporting stage before executing the generated code. The SemanticAnalyzer traverses the AST and uses a symbol table to identify conditions such as undeclared variables, undeclared arrays, and inappropriate mathematical operations. Because the analyzer operates on the AST produced by the CFG-based Parser, it can examine the relationships among statements and expressions before code generation. This reduces the chance of certain semantic problems carrying into the generated Python. The semantic analysis stage therefore complements SDT by checking relevant conditions within the same structured representation used for translation. 

The system also incorporates validation-driven refinement and error-handling mechanisms. When the Parser identifies certain unclosed blocks, the system can use the structured parser error to determine the expected closing construct and apply an automatic correction before repeating compilation. Levenshtein distance also helps identify possible corrections for incorrectly entered keywords [47]. After a correction, the system can reprocess the input through tokenization, parsing, and semantic analysis before generating code. These mechanisms support the CFG-SDT process by helping maintain the structural requirements necessary for translation while providing users with meaningful feedback about invalid input. 

In addition, Skulpt, an in-browser Python interpreter, supports executing the translation output [48]. After the SDT CodeGenerator produces the Python output, Skulpt executes the generated code within the browser environment. This provides a direct way to check whether the translated output can be executed, rather than merely displaying it as generated text. Therefore, the translation outcome can be considered in two related ways: the generated Python must follow the required Python syntax, and the resulting code must be executable within the system's supported environment. 

**75** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

The system's implementation uses Vanilla JavaScript (ES6+) as the primary programming language for the compiler pipeline, including the Lexer, Parser, SemanticAnalyzer, and CodeGenerator. HTML and CSS provide the user interface through which users enter pseudocode and receive the translated Python output. Browser localStorage persists stored system information and metric history, while Service Worker technology supports the Progressive Web Application (PWA) architecture through an offline-first caching mechanism [49]. PDF.js is integrated to allow students and instructors to access guides and documentation within the application [50]. These technologies support PseudoPy, while the CFG, AST, Parser, SemanticAnalyzer, and SDT CodeGenerator are the components most directly involved in the translation addressed by SOP #1. 

Visual Studio Code, GitHub, and Vercel supported PseudoPy development. Visual Studio Code was used as the primary development environment for writing and managing the source code. GitHub supported source-code management and version control, while Antigravity was used as a development support tool during implementation. Vercel supported the deployment of the proposed application. These tools facilitated the development and delivery of PseudoPy but do not themselves determine the translation rules. Their role is therefore considered supportive of the implementation rather than a direct factor in the CFG-SDT translation mechanism. 

The proposed system's technical methodology is primarily based on SyntaxDirected Translation and formal grammar modeling [45]. SDT provides the translation methodology by associating recognized grammar structures with specific translation actions, while formal grammar modeling defines the pseudocode language. Constructivism and Cognitive Load Theory provide the pedagogical foundations of the proposed system by supporting an environment where learners can construct and refine programming concepts while reducing unnecessary syntax-related difficulty [51], [52]. These methodologies provide the system's theoretical and instructional context, while the CFG and SDT pipeline provides the technical mechanism for pseudocode translation. 

**76** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

The system further examines translation outcomes using a ground-truth dataset and quantitative evaluation methods. The ground-truth dataset contains ten pseudocode-Python pairs covering various algorithmic constructs. These reference cases provide expected outputs to compare with the Python code PseudoPy generates. The Metrics Engine computes measures including accuracy, Precision, recall, and F1-score to provide quantitative evidence of the translation results [53]. Logic Gap Analysis also compares structural keywords such as IF, WHILE, and FOR between student pseudocode and instructor solutions to identify missing or additional logical structures. 

Overall, applying SDT influences the translation outcome by transforming the structures established and recognized through the CFG into corresponding Python constructs [45]. The CFG establishes the valid grammatical structure, the Lexer identifies the input tokens, and the Parser validates the production rules. It constructs the AST, and the SDT CodeGenerator applies translation rules to those AST structures [46]. Semantic analysis provides additional validation before generation, while indentation management and operator mapping help preserve Python syntax. Skulpt then provides an execution environment for the generated code, and the ground-truth dataset and evaluation metrics provide evidence of the resulting translation performance [48]. Thus, the relationship between CFG and SDT can be seen as a continuous process in which CFG defines the valid structure, the AST represents that structure, SDT translates it, and the resulting Python code is generated and executed. 

## **2. Mapping Model and Validation Mechanism** 

The second specific problem examined how the mapping model with a validation mechanism improves code-generation correctness, reduces syntax and runtime errors, and reduces generation time compared with traditional pseudocodeto-code methods. The mapping model with a validation mechanism in the PseudoPy system improves the code-generation process by combining input normalization, 

**77** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Context-Free Grammar (CFG) enforcement, Abstract Syntax Tree (AST) construction, semantic validation, and structured code generation. Compared with a simpler, direct, or line-based translation approach, PseudoPy introduces an additional mapping and validation process before code generation, allowing structural and semantic issues to be identified prior to producing Python output. 

As discussed under the first specific problem, this process begins with mapping and normalization, proceeds through the Lexer and CFG-based Parser to construct an AST, and is checked by the Semantic Analyzer for issues such as undeclared variables before the SDT CodeGenerator produces the corresponding Python code, which is then passed to Skulpt for execution within the browser. Through this process, PseudoPy does not simply convert pseudocode directly into Python; instead, it maps, analyzes, validates, and structures the input before generating the final code. 

Because this study did not involve building or testing a separate baseline system, the traditional/unvalidated method figures presented in this section are drawn from published literature on comparable pseudocode-to-code and rule-based translation approaches, rather than from a directly tested control group within this study. This comparison is intended to situate PseudoPy's performance within the broader body of research on automated and manual translation accuracy, rather than to claim a controlled experimental comparison. 

### **2.1 Percentage Improvement in Code Generation Correctness** 

Traditionally, pseudocode-to-Python translation is done by hand. Hence, mistakes in indentation, syntax, or logic often go unnoticed until the code fails to run a student translating pseudocode manually has no equivalent checkpoint verifying the structure before submission, so an unclosed IF, a missing colon, or mismatched indentation only surfaces once the code fails to run, or worse, runs but produces the 

**78** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

wrong output. This is consistent with literature on beginner programmers, which shows around 44–52% of manual translations contain these kinds of errors [64], and unvalidated rule-based translation methods only reach about 35–58% correctness [65], [66]. 

Based on the results in Table  8 the Perfomace Metrics table, the  PseudoPy obtained an F1-Score of 54.9% across the 30 ground-truth test cases, reflecting a precision of 41.6% and a recall of 80.7%. Compared against the 35–58% correctness range reported in the literature (midpoint ≈46.5%): 

We use the formula of **Percentage Increase** to identify the % improvement in code generation correctness comparing to the citated studies: 



<!-- Start of picture text -->
y = New Value a—EEOld Value<br>% Change = Old Value x 100<br><!-- End of picture text -->

- New Value = PseudoPy's F1-Score (54.9%) 

- Old Value = Traditional baseline midpoint (46.5%) 



<!-- Start of picture text -->
% Improvement = 165%54.9% — 46.5% * 100 = 18.1%<br><!-- End of picture text -->

This indicates that PseudoPy's mapping-and-validation mechanism produced code generation correctness approximately 18.1% higher than the midpoint reported for traditional, unvalidated pseudocode-to-code translation approaches in the reviewed literature. 

**79** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **2.2 Reduction in Syntax and Runtime Errors** 

In PseudoPy, the validation mechanism acts as an additional checkpoint before code generation. It checks the structure, nesting, and other supported elements of the pseudocode before the system produces Python code, allowing errors to be identified earlier rather than only during execution. The cited literature also reports that a comparable rule-based validation approach achieved 96.1% error-correction accuracy compared with 74.1% without validation [67]. These results support the role of validation as a mechanism for detecting and correcting errors before they affect the generated output; however, these figures are literature-based and are presented as supporting context rather than PseudoPy's own measured results. 

Based on the results in Table 8, PseudoPy obtained a 100% compile rate across all 30 test cases, indicating that every generated Python output was free of syntax and runtime errors. Compared against the 38–52% error rate reported in the literature for unaided manual and unvalidated automated translation (midpoint ≈45%): 

Here we used the formula of Percentage Reduction or Percentage Decrease to identify the reduction in syntax and runtime errors: 



<!-- Start of picture text -->
% Reduction. = ——“aiiValueOld Value — New Value 100<br><!-- End of picture text -->

Where : 

- **Old Value** = Traditional baseline error rate midpoint (45%) 

- **New Value** = PseudoPy's error rate (0%) 



<!-- Start of picture text -->
Error Rate Reduction = a x 100 = 100%<br>45%<br><!-- End of picture text -->

This indicates that PseudoPy's validation mechanism eliminated the syntax and runtime error rate observed in traditional, unvalidated translation approaches, as no compilation or runtime failures were recorded across the tested dataset. 

**80** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **2.3 Faster Code Generation Time** 

Because PseudoPy runs its compiler pipeline on the user's device using clientside technologies, the system can process input without relying on a remote server for translation. The literature describes local processing as capable of completing operations in milliseconds, while cloud-based tools may experience additional delays due to network communication [68]. 

Based on the results in Table 3, PseudoPy obtained an average generation time of 0.75 milliseconds per test case, compared against the 1,200–3,500 millisecond generation latency [68] reported for cloud-based program synthesis models in the literature. This makes PseudoPy's generation time about 1,600 to 4,667 times faster than cloud-based approaches, consistent with its client-side processing architecture. 

### **2.4 Overall Effect of the Mapping and Validation Mechanism** 

Overall, the mapping model and validation mechanism provide a structured process in which pseudocode is normalized, checked, represented, validated, and translated into Python. This approach is designed to improve the consistency of code generation, identify errors earlier, and support efficient translation while maintaining the structural relationship between the input pseudocode and the generated Python code, as reflected in the 18.1% correctness improvement, 100% error rate reduction, and substantially faster generation time obtained in this study relative to the traditional methods reported in the literature. 

**81** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|**Metric**|**PseudoPy**<br>**(This**<br>**Study,**<br>**Tested)**|**Traditional/Baseline**<br>**Method (Literature)**|**%**<br>**Improvement**|**Source**|
|---|---|---|---|---|
|Code<br>Generation<br>Correctness<br>(F1-Score)|54.9%|35%–58% (midpoint<br>≈46.5%)|≈18.1%<br>higher|Mukherjee<br>et<br>al.<br>(2023);<br>Zan et al.<br>(2022)|
|Syntax/Runtime<br>Error Rate|0% (100%<br>compile<br>rate)|38%–52% (midpoint<br>≈45%)|100%<br>reduction|Prather et<br>al. (2023);<br>Barke<br>et<br>al. (2023)|
|Generation<br>Time|0.75<br>ms<br>(average)|1,200–3,500 ms|≈1,600–<br>4,667× faster|Nijkamp et<br>al. (2022)|



### **Table 7. Comparative Performance Between PseudoPy and Traditional Method** 

These Traditional/Baseline figures come from published literature and represent general ranges rather than a directly tested control group in this study, since this study did not build or test a separate baseline system. PseudoPy figures are the study's own measured results obtained from testing the 30-case ground-truth dataset, as presented in Table 3 under the third specific problem. 

**82** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **3. Hybrid Pseudocode-to-Python Translation Performance** 

The third specific problem examined how the hybrid model and transformation logic of algorithms in the PseudoPy system convert pseudocode into Python code, in terms of code generation accuracy, syntactic correctness, semantic correctness, execution success rate, and generation time. 

The hybrid model refers to the combined operation of the system's core algorithms and its CFG-SDT translation logic. The Sequential Parsing Algorithm processes the normalized pseudocode input in a strict, linear, step-by-step manner. The Stack-Based Syntax Validation Algorithm applies a Last-In, First-Out (LIFO) mechanism to confirm that control structures such as IF/END IF and WHILE/END WHILE are properly paired and nested. The Levenshtein Distance Algorithm, implemented through dynamic programming, computes the similarity between user input and valid keywords to support suggestion-based correction of misspelled or partially incorrect commands. The Linear Search Algorithm is applied during semantic analysis to locate identifiers, keywords, and mapping rules within the system's stored data structures. These algorithms operate together with the CFG-SDT pipeline discussed under the first section. 

To evaluate the performance of this hybrid model, the Metrics Engine compares the Python code generated by PseudoPy against a ground-truth dataset consisting of ten pseudocode-Python pairs covering different algorithmic constructs, such as sequential statements, conditional statements, iterative statements, and array or variable operations. Each pair in the dataset represents an instructor-validated reference solution against which the system's generated output is measured. The following subsections present the criteria used to evaluate the hybrid model's translation performance. 

**83** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **3.1 Code Generation Accuracy** 

Code generation accuracy measures how closely the Python code PseudoPy produces matches the corresponding reference solution in the ground-truth dataset. The Metrics Engine computes this using Exact Match Accuracy (EMA), which checks whether the generated output matches the expected translation for each of the ten test cases. A higher accuracy value indicates that the hybrid model's CFG-SDT translation logic consistently produces the Python constructs expected for a given pseudocode structure. 

### **3.2 Syntactic Correctness** 

Syntactic correctness measures whether the Python code generated for each test case contains no syntax errors. This is verified structurally through the CFG-enforced recursive descent Parser during translation, and confirmed further when the generated output is processed by Skulpt, the in-browser Python interpreter used by the system. A test case is syntactically correct if the Skulpt interpreter can parse the generated code without raising a syntax error. 

### **3.3 Semantic Correctness** 

Semantic correctness measures whether the generated Python code preserves the original pseudocode's intended logic, beyond merely following correct syntax. This is assessed through the SemanticAnalyzer, which traverses the Abstract Syntax Tree (AST) using a symbol table to check for conditions such as undeclared variables and inappropriate operations, and through Logic Gap Analysis, which compares structural keywords (e.g., IF, WHILE, FOR) between the generated solution and the instructorprovided reference to identify missing or additional logical structures. A test case is considered semantically correct when its logical structure matches that of the corresponding ground-truth solution. 

**84** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **3.4 Execution Success Rate** 

Execution success rate measures whether the generated Python code runs without runtime errors. We test this by running each test case's generated code in Skulpt in the browser. We record a test case as a successful execution if the program completes without raising a runtime error, indicating that the translation is not only syntactically valid but also executable, consistent with the two-part discussion of executability presented under the first specific problem. 

### **3.5 Generation Time** 

Generation time measures how long PseudoPy takes to process a given pseudocode input, from tokenization to producing Python output. This is measured client-side across the lexing, parsing, semantic analysis, and code-generation stages of the compiler pipeline, consistent with the generation-time figures discussed under the second specific problem. Because PseudoPy performs all processing locally in the browser rather than relying on a remote server or an external code-generation service, generation time for the hybrid model should reflect only local computation, not network latency. 

### **Hybrid Translation Performance per Test Case** 

The results of the hybrid translation process, based on testing performed on the pairs of the ground-truth dataset, are presented in Table 8. 

|**Test ID**|**Pseudocode**|**Compiled**|**Exact**|**Precision**|**Recall**|**Gen.**|
|---|---|---|---|---|---|---|
||**Construct Tested**|||||**Time**|
||||**Match**|||**(ms)**|





<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **85** 

|algo_1|While<br>Loop<br>Mathematical<br>Series|Pass|No|88%|100%|1.0|
|---|---|---|---|---|---|---|
|algo_2|Modulo Branching<br>Logic|Pass|No|41%|67%|0.2|
|algo_3|Modulo Branching<br>Logic|Pass|No|41%|67%|0.2|
|algo_4|In-Place<br>Array<br>Transformation|Pass|No|25%|75%|0.2|
|algo_5|While<br>Loop<br>Mathematical<br>Series|Pass|No|88%|100%|0.1|
|algo_6|In-Place<br>Array<br>Transformation|Pass|No|25%|75%|0.2|
|algo_7|Factorial<br>Computation|Pass|No|29%|80%|0.1|
|algo_8|Factorial<br>Computation|Pass|No|29%|80%|0.2|
|algo_9|While<br>Loop<br>Mathematical<br>Series|Pass|No|88%|100%|0.1|
|algo_10|Array<br>Filtering<br>(Count)|Pass|No|41%|86%|0.2|





<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **86** 

|algo_11|Factorial<br>Computation|Pass|No|29%|80%|0.3|
|---|---|---|---|---|---|---|
|algo_12|Array<br>Filtering<br>(Count)|Pass|No|41%|86%|0.2|
|algo_13|Array<br>Filtering<br>(Count)|Pass|No|41%|86%|0.2|
|algo_14|In-Place<br>Array<br>Transformation|Pass|No|25%|75%|0.3|
|algo_15|Array<br>Filtering<br>(Count)|Pass|No|41%|86%|0.2|
|algo_16|Factorial<br>Computation|Pass|No|29%|80%|0.1|
|algo_17|Modulo Branching<br>Logic|Pass|No|41%|67%|0.1|
|algo_18|While<br>Loop<br>Mathematical<br>Series|Pass|No|88%|100%|0.1|
|algo_19|Factorial<br>Computation|Pass|No|29%|80%|0.1|
|algo_20|Modulo Branching<br>Logic|Pass|No|41%|67%|0.0|
|algo_21|In-Place<br>Array<br>Transformation|Pass|No|25%|75%|0.1|





<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **87** 

|algo_22|Factorial<br>Computation|Pass|No|29%|80%|0.0|
|---|---|---|---|---|---|---|
|algo_23|In-Place<br>Array<br>Transformation|Pass|No|25%|75%|0.0|
|algo_24|Array<br>Filtering<br>(Count)|Pass|No|41%|86%|0.1|
|algo_25|Modulo Branching<br>Logic|Pass|No|41%|67%|0.2|
|algo_26|While<br>Loop<br>Mathematical<br>Series|Pass|No|88%|100%|0.0|
|algo_27|In-Place<br>Array<br>Transformation|Pass|No|25%|75%|0.2|
|algo_28|In-Place<br>Array<br>Transformation|Pass|No|25%|75%|0.0|
|algo_29|In-Place<br>Array<br>Transformation|Pass|No|25%|75%|0.2|
|algo_30|Factorial<br>Computation|Pass|No|29%|80%|0.1|
|**Overall**<br>**Result**||**100%**|**0%**|**41.6%**|**80.7%**|**0.17 ms**|



### **Table 9. Hybrid Translation Performance per Test Case** 

**88** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Based on these results, PseudoPy achieved a 100% compile rate, indicating that all 30 generated outputs were free of syntax and runtime errors. However, the Exact Match accuracy was 0%, meaning that none of the 30 outputs matched the instructor reference solution character-for-character. This does not indicate a failure of translation; rather, it reflects that Exact Match is an unusually strict metric that penalizes any variation in variable naming, spacing, or statement ordering, even when the underlying logic is correct. This is supported by the Precision (41.6%) and Recall (80.7%) results, which show that PseudoPy's generated code captured a large majority of the expected logical lines (80.7% Recall) while also introducing some additional or differently structured lines not present in the reference solution (41.6% Precision), yielding an F1-Score of 54.9%. The highest Precision and Recall were observed on the While Loop Mathematical Series construct (88% Precision, 100% Recall across algo_1, algo_5, algo_9, algo_18, and algo_26). In comparison, the lowest Precision was observed on the In-Place Array Transformation and Modulo Branching Logic constructs (25% and 41%, respectively), suggesting these constructs produce Python translations that diverge more structurally from the reference solution despite compiling and running successfully. The average generation time across all 30 test cases was 0.17 milliseconds, consistent with PseudoPy's client-side processing architecture discussed under the second specific problem. 

## **4. Performance Metrics of PseudoPy** 

The fourth specific problem focused on measurable metrics for evaluating automated pseudocode-to-code translation, particularly accuracy, precision, compilation success rate, execution time, and runtime error rate. The Metrics Engine of PseudoPy was designed to calculate these performance measures using the same ground-truth dataset described under the third specific problem, consisting of validated pseudocode-to-Python pairs. The manuscript identifies accuracy, precision, recall, and F1-score as the primary 

**89** 



<!-- Start of picture text -->
Guiversity of Cabupao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

metrics computed by the Metrics Engine, in addition to compilation success rate, execution time, and runtime error rate. Consistent with the per-test-case results presented under the third specific problem (Table 8), the following subsections present the Metrics Engine's aggregate evaluation of the ground-truth dataset for each of the five measurable metrics identified in this specific problem. Figure 12 . Pipeline stage Timing **4.1 Accuracy** Accuracy, as computed by the Metrics Engine, refers to Exact Match Accuracy — the percentage of generated Python outputs that match the ground-truth reference solution character-for-character. Based on the aggregate results in Table 9, PseudoPy achieved 0% accuracy across the 30 test cases in the ground-truth dataset, meaning none of the generated outputs matched the reference solutions exactly. This does not indicate a translation failure; rather, it reflects the strictness of the Exact Match metric, which penalizes any variation in variable naming, line ordering, or formatting even when the underlying logic is preserved. et ee 

**90** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **4.2 Precision** 

Precision, as computed by the Metrics Engine, measures the proportion of lines in the generated code that match lines in the reference solution (correct lines ÷ generated lines). Based on the aggregate results in Table 4, PseudoPy obtained a precision of 41.6%, indicating that a substantial portion of the generated code included additional or differently structured lines not present in the reference solution. 

## **4.3 Compilation Success Rate** 

Compilation success rate refers to the percentage of test cases for which the generated Python code was free of syntax errors and processed successfully by the parsing pipeline. Based on the aggregate results in Table 4, PseudoPy achieved a compilation success rate of 100% across all 30 test cases, reflecting the reliability of the Lexer, Parser, and Code Generation stages in consistently producing syntactically valid Python code. 

## **4.4 Execution Time** 

Execution time, measured by the Metrics Engine using JavaScript's native timing functions, is the average time required to process a pseudocode input through the Lexer, Parser, Semantic Analyzer, and Code Generator stages. Based on the aggregate results in Table 10, PseudoPy averaged 0.0005 seconds (0.5 milliseconds) per test case. Figure 12.presents the average time spent in each compiler stage. Of the total processing time, the Parser stage accounted for the largest share (0.425ms), consistent with its role in applying CFG production rules and constructing the AST. At the same time, Code Generation required the least time (0.125ms), with the Lexer (0.15ms) and Semantic Analysis (0.325ms) stages falling between the two. 

**91** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **4.5 Runtime Error Rate** 

Runtime error rate refers to the percentage of generated programs that produced a runtime error during execution. Because PseudoPy uses Skulpt, an in-browser Python interpreter, code parsing and execution occur as a single combined step rather than as separate compile-then-run phases; a test case that compiles under Skulpt proceeds directly to execution without an intermediate failure point. For this reason, the runtime error rate reported in Table 10 (0%) reflects the same underlying outcome as the compilation success rate (100%), rather than an independently measured execution metric distinct from compilation. This is a structural characteristic of PseudoPy's execution architecture and is distinct from systems with a separate ahead-oftime compilation stage, where a program may compile successfully but still fail at runtime. 

Table 10 presents the consolidated performance metrics PseudoPy achieved across all five measures. 

## **Performance Metrics of PseudoPy** 

|**Metric**|**Result**|
|---|---|
|Accuracy|0%|
|Precision|41.6%|
|Recall|80.7%|
|F1-Score|54.9%|
|Compilation Success Rate|100%|
|Average Execution Time|0.0005 seconds|





<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **92** 

|**Metric**|**Result**|
|---|---|
|Runtime Error Rate|0%|



### **Table 10. Performance Metrics** 

## **Assessment of the End Users** 

The proposed PseudoPy system was evaluated by 24 respondents: 18 students and 6 instructors. The evaluation focused on four criteria identified in the study: Usability, Learnability, Efficiency, and Reliability. A four-point Likert scale was used, where 4 represents Strongly Agree, 3 represents Agree, 2 represents Disagree, and 1 represents Strongly Disagree. The responses were analyzed using frequencies, percentages, and weighted means. The resulting weighted means were interpreted as follows: 3.26–4.00 as Strongly Agree, 2.51–3.25 as Agree, 1.76–2.50 as Disagree, and 1.00–1.75 as Strongly Disagree. The following sections present and discuss the results for each evaluation criterion. 

### **Usability** 

For **usability,** the end users evaluated the proposed system based on the following questions: 

Q1 - The interface of the PseudoPy system is easy to understand. 

Q2 - The layout and design are clear and organized. 

Q3 - Navigation between system features is straightforward. 

Q4 - The instructions provided are easy to follow. 

**93** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Q5 - The system is easy to use even for first-time users. 

The results in Table 11. shows that respondents strongly agreed with the Usability of the proposed PseudoPy system, with an overall weighted mean of 3.70, interpreted as Strongly Agree. Among the five usability indicators, Q2 had the highest weighted mean (3.92). This indicates that the respondents generally found the system's layout and design clear and organized. The remaining indicators also received weighted means within the Strongly Agree range, from 3.54 to 3.71. 

These results indicate that the respondents generally found the interface understandable, navigation straightforward, instructions easy to follow, and the system accessible even to first-time users. Overall, the findings indicate that PseudoPy provides an interface that supports users in interacting with its intended pseudocode-to-Python translation functions. 

|**Question**|**SA f (%)**|**A f (%)**|**D f (%)**|**SD f**<br>**(%)**|**Weighted**<br>**Mean**|**Interpretation**|
|---|---|---|---|---|---|---|
|Q1|18<br>(75.00%)|5<br>(20.83%)|1<br>(4.17%)|0<br>(0.00%)|3.71|Strongly<br>Agree|
|Q2|22<br>(91.67%)|2<br>(8.33%)|0<br>(0.00%)|0<br>(0.00%)|3.92|Strongly<br>Agree|
|Q3|17<br>(70.83%)|6<br>(25.00%)|1<br>(4.17%)|0<br>(0.00%)|3.67|Strongly<br>Agree|
|Q4|18<br>(75.00%)|4<br>(16.67%)|2<br>(8.33%)|0<br>(0.00%)|3.67|Strongly<br>Agree|



**94** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|Q5|16<br>(66.67%)|5<br>(20.83%)|3<br>(12.50%)|0<br>(0.00%)|3.54|Strongly<br>Agree|
|---|---|---|---|---|---|---|



### **Table 11: End User Assessment of Usability** 

### **Learnability** 

For **Learnability** , the end users evaluated the proposed system based on the following questions: 

Q1 - The system helped me understand how Python code is translated into pseudocode. 

Q2 - The generated pseudocode is easy to understand. 

Q3 - The examples and feedback improved my understanding of programming logic. 

Q4 - The system helped improve my pseudocode-writing skills 

Q5 - Using the system increased my confidence in creating pseudocode. 

For learnability, Table 12 shows that end users obtained an overall weighted mean of 3.52, interpreted as Strongly Agreed, indicating that the proposed system is understandable and learnable with minimal difficulty. 

Respondents strongly agreed that the system helped them understand how the compiler translates Python into pseudocode whenever an error occurs. For Q2 and Q4, the respondents showed 3.50 weighted mean of 3.50, indicating strong agreement that the generated pseudocode is easy to understand and that the system helped improve their pseudocode-writing skills. Q3 and Q5 also had a higher weighted mean of 3.54, indicating that the examples and feedback improved their understanding of programming logic and that using the system increased their confidence in creating pseudocode. 

**95** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Overall, the findings support PseudoPy's purpose as a learning-oriented system: it helps users, especially students who need to understand the system's workflow, learn algorithmic and programming logic through pseudocode and its translation into Python, while instructors assign tasks that let students practice or learn at their own pace. 

|**Question**|**SA f (%)**|**A f (%)**|**D f (%)**|**SD f**<br>**(%)**|**Weighted**<br>**Mean**|**Interpretation**|
|---|---|---|---|---|---|---|
|Q1|13<br>(54.17%)|10<br>(41.67%)|1<br>(4.17%)|0<br>(0.00%)|3.50|Strongly<br>Agree|
|Q2|14<br>(58.33%)|8<br>(33.33%)|2<br>(8.33%)|0<br>(0.00%)|3.50|Strongly<br>Agree|
|Q3|14<br>(58.33%)|9<br>(37.50%)|1<br>(4.17%)|0<br>(0.00%)|3.54|Strongly<br>Agree|
|Q4|13<br>(54.17%)|10<br>(41.67%)|1<br>(4.17%)|0<br>(0.00%)|3.50|Strongly<br>Agree|
|Q5|14<br>(58.33%)|9<br>(37.50%)|1<br>(4.17%)|0<br>(0.00%)|3.54|Strongly<br>Agree|



### **Table 12.  Assessment in Terms of Learnability** 

### **Efficiency** 

For **Efficiency** , the end users evaluated the proposed system based on the following questions: 

**96** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Q1 - The system translates Python code into pseudocode quickly. Q2 - The system responds promptly to user inputs. Q3 - The application runs smoothly without noticeable delays. 

Q4 - The system performs efficiently during continuous use. 

Q5 - Overall, the system provides fast and reliable performance. 

For Efficiency, Table 11 shows that end users obtained an overall weighted mean of 3.65, interpreted as Strongly Agree, indicating that the proposed system provides efficient performance with minimal delays. 

For Q1 and Q4, the respondents obtained a weighted mean of 3.67, interpreted as Strongly Agree, indicating that the system translates Python code into pseudocode quickly and performs efficiently during continuous use. Meanwhile, Q2 received a weighted mean of 3.54, showing that the system responds promptly to user inputs. 

For Q3, the weighted mean of 3.63 indicates that the application runs smoothly without noticeable delays. Finally, Q5 obtained the highest weighted mean of 3.75, indicating that the system provides fast and reliable performance. 

Overall, the findings indicate that PseudoPy was perceived as responsive, smooth, and efficient during use, supporting its purpose as an automated translation and learning-oriented system. 

|**Question**|**SA f (%)**|**A f (%)**|**D f (%)**|**SD f (%)**|**Weighted Mean**|
|---|---|---|---|---|---|
|Q1|17 (70.83%)|6 (25.00%)|1 (4.17%)|0 (0.00%)|3.67|
|Q2|14 (58.33%)|9 (37.50%)|1 (4.17%)|0 (0.00%)|3.54|
|Q3|16 (66.67%)|7 (29.17%)|1 (4.17%)|0 (0.00%)|3.63|



**97** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|Q4|17 (70.83%)|6 (25.00%)|1 (4.17%)|0 (0.00%)|3.67|
|---|---|---|---|---|---|
|Q5|19 (79.17%)|4 (16.67%)|1 (4.17%)|0 (0.00%)|3.75|



### **Table 13. Assessment in Terms of Efficiency** 

### **Reliability** 

For Reliability. Table 14, shows that end users obtained an overall weighted mean of 3.57, interpreted as Strongly Agree, indicating that the proposed system reliably performs its intended functions. 

For Q1, the respondents obtained a weighted mean of 3.50, interpreted as Strongly Agree, indicating that the system accurately translates Python code into pseudocode. Q2 obtained the highest weighted mean of 3.71, showing that the generated pseudocode follows proper pseudocode conventions. Meanwhile, Q3 obtained 3.58, indicating that the system performs its intended translation functions correctly. Q4 obtained the lowest weighted mean of 3.42, showing that the translation results meet the respondents' expectations. Lastly, Q5 obtained 3.63, indicating that the system fulfills its purpose as a learning tool for pseudocode. 

Overall, the findings indicate that the respondents perceived PseudoPy as reliable in producing proper translation results and supporting its intended purpose as a learning tool for pseudocode 

|**Question**|**SA f (%)**|**A f (%)**|**D f (%)**|**SD f**<br>**(%)**|**Weighted**<br>**Mean**|**Interpretation**|
|---|---|---|---|---|---|---|



**98** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|Q1|15<br>(62.50%)|6<br>(25.00%)|3<br>(12.50%)|0<br>(0.00%)|3.50|Strongly<br>Agree|
|---|---|---|---|---|---|---|
|Q2|18<br>(75.00%)|5<br>(20.83%)|1<br>(4.17%)|0<br>(0.00%)|3.71|Strongly<br>Agree|
|Q3|15<br>(62.50%)|8<br>(33.33%)|1<br>(4.17%)|0<br>(0.00%)|3.58|Strongly<br>Agree|
|Q4|13|8|3|0|3.42|Strongly|
||(54.17%)|(33.33%)|(12.50%)|(0.00%)||Agree|
|Q5|17<br>(70.83%)|5<br>(20.83%)|2<br>(8.33%)|0<br>(0.00%)|3.63|Strongly<br>Agree|



### **Table 14. Assessment in Terms of Reliability** 

### **Overall Assessment of Students and Instructors** 

Overall, the four evaluation criteria received weighted means within the Strongly Agree range. Usability had the highest criterion-level weighted mean (3.70), followed by Efficiency (3.65) and Reliability (3.57). Learnability had the lowest criterion-level weighted mean (3.52). Despite this difference, all four criteria were interpreted as Strongly Agree. The combined overall weighted mean was 3.61, also interpreted as Strongly Agree. These findings indicate that the 18 students and 6 instructors generally assessed the proposed PseudoPy system positively in terms of its Usability, learnability, Efficiency, and Reliability. The results support the system's intended purpose as a learning-oriented tool for translating pseudocode into Python. The survey findings represent the respondents' assessment of the system. They should be considered separately from objective system-performance measures such 

**99** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

as accuracy, precision, recall, F1-score, compilation success rate, and execution time. 

|**Criterion**|**Overall Weighted Mean**|**Verbal Interpretation**|
|---|---|---|
|Usability|3.70|Strongly Agree|
|Learnability|3.52|Strongly Agree|
|Efficiency|3.65|Strongly Agree|
|Reliability|3.57|Strongly Agree|
|Overall|3.61|Strongly Agree|



**Table 15. Overall Assessment of End Users** 

### **IT Experts’ Assessment of the Proposed System** 

This section presents the sixth specific problem, which determines IT experts' evaluation level of the PseudoPy system based on selected ISO/IEC 25010 quality criteria: functional suitability, usability, reliability, performance efficiency, maintainability, and portability. The evaluation assessed the quality and overall performance of the proposed system based on the criteria specified in the Statement of the Problem. The questionnaire used a four-point Likert scale, and the weighted mean summarized the IT experts' ratings for each evaluation criterion. The resulting 

**100** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

mean scores were interpreted using the following ranges: **3.26–4.00 as Strongly Agree, 2.51–3.25 as Agree, 1.76–2.50 as Disagree, and 1.00–1.75 as Strongly Disagree. 

The following sections present and discuss the results for each criterion to determine the overall evaluation of the proposed PseudoPy system. 

### **Functional Suitability** 

For Functional Suitability, the IT expert evaluated the proposed system based on the following questions: 

Q1 -The system accurately translates pseudocode into Python code that fulfills its intended functional requirements. 

Q2 - The system provides a complete set of core features necessary to perform automated pseudocode evaluation. 

Q3 - The system correctly handles the range of pseudocode constructs it claims to support (variables, control structures, functions). 

Q4 - The system produces complete and appropriate results for the tasks it        is designed to perform. 

Q5 - Overall, I am satisfied that the system's functions are suitable for its intended purpose. 

|**QUESTION**|**SA f (%)**|**A f (5)**|**D f (%)**|**Sd f(%)**|**Weighted**<br>**Mean**|
|---|---|---|---|---|---|
|**Q1**|5(83.33%)|1(16.67)|0 (0%)|0 (0%)|3.83|
|**Q2**|4(66.67%)|2(33.33)|0 (0%)|0 (0%)|3.67|



**101** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|**Q3**|3(50.00)|3(50.00%)|0 (0%)|0 (0%)|3.50|
|---|---|---|---|---|---|
|**Q4**|5(83.33)|1<br>(16.67%)|0 (0%)|0 (0%)|3.83|
|**Q5**|5(83.33)|1<br>(16.67%)|0 (0%)|0 (0%)|3.83|



### **Table 16. Assessment in Terms of Functional Suitability** 

For Functional Suitability. Table 16 shows that the IT expert evaluators obtained an overall weighted mean of 3.73, interpreted as Strongly Agree, indicating that the proposed system's functions are suitable for its intended purpose. 

For Q1, the respondents obtained a weighted mean of 3.83, interpreted as Strongly Agree, indicating that the system accurately translates pseudocode into Python code that fulfills its intended functional requirements. Q2 obtained a weighted mean of 3.67, showing that the system provides a complete set of core features necessary to perform automated pseudocode evaluation. Meanwhile, Q3 obtained the lowest weighted mean of 3.50, indicating that the system correctly handles the range of pseudocode constructs it claims to support, such as variables, control structures, and functions. Q4 obtained a weighted mean of 3.83, showing that the system produces complete and appropriate results for the tasks it is designed to perform. Lastly, Q5 obtained the highest weighted mean of 3.83, indicating that the evaluators are satisfied that the system's functions are suitable for its intended purpose. 

Overall, the findings indicate that the IT experts perceived PseudoPy as functionally suitable, capable of correctly performing its core translation and evaluation tasks. 

**102** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

### **Usability** 

For Usability, the IT Expert evaluated the proposed system based on the following questions: 

Q1 -The system's interface is easy to understand and navigate. 

Q2 - Users can learn to operate the system's core functions with minimal guidance. 

Q3 - The system provides clear, understandable feedback and error messages. 

Q4 - The user interface effectively protects users from thinking errors through visual cues and clear input constraints. 

Q5 - Overall, I am satisfied with the system's usability. 

|**QUESTION**|**SA f (%)**|**A f (5)**|**D**<br>**f**<br>**(%)**|**Sd f(%)**|**Weighted**<br>**Mean**|**Interpretation**|
|---|---|---|---|---|---|---|
|Q1|4<br>(66.67%)|2<br>(33.33%)|0<br>(0%)|0 (0%)|3.67|Strongly<br>Agree|
|Q2|5<br>(83.33%)|1<br>(16.67%)|0<br>(0%)|0 (0%)|3.83|Strongly<br>Agree|
|Q3|5<br>(83.33%)|1<br>(16.67%)|0<br>(0%)|0 (0%)|3.83|Strongly<br>Agree|
|Q4|6<br>(100.00%)|0 (0%)|0<br>(0%)|0 (0%)|4.00|Strongly<br>Agree|
|Q5|5<br>(83.33%)|1<br>(16.67%)|0<br>(0%)|0 (0%)|3.83|Strongly<br>Agree|



**Table 17. Assessment in Terms of Usability** 

**103** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

For Usability Table 17, shows that the IT expert evaluators obtained an overall weighted mean of 3.83, interpreted as Strongly Agree, indicating that the proposed system is usable and easy to operate for its end users. 

For Q1, the respondents obtained a weighted mean of 3.67, interpreted as Strongly Agree, indicating that the system's interface is easy to understand and navigate. Q2 obtained a weighted mean of 3.83, showing that users can learn to operate the system's core functions with minimal guidance. Meanwhile, Q3 also obtained 3.83, indicating that the system provides clear, understandable feedback and error messages. Q4 obtained the highest weighted mean of 4.00, showing that the user interface effectively protects users from thinking errors through visual cues and clear input constraints. Lastly, Q5 obtained 3.83, indicating that the evaluators are satisfied with the system's usability. 

Overall, the findings indicate that the IT experts perceived PseudoPy as highly usable, with an interface that is easy to navigate, learn, and use with minimal guidance. 

### **Reliability** 

For Reliability, the IT Expert evaluated the proposed system based on the following questions: 

Q1 -The system performs its functions consistently without unexpected failures. 

Q2 -The system remains available and operational, including during offline use. 

Q3 - The system recovers gracefully from errors without losing user data or progress. 

Q4 - The system's translation and execution results are stable and repeatable across multiple attempts. 

**104** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Q5 - Overall, I am confident in the system's reliability. 

|**QUESTION**|**SA f (%)**|**A f (5)**|**D f (%)**|**Sd**<br>**f(%)**|**Weighted**<br>**Mean**|**Interpretation**|
|---|---|---|---|---|---|---|
|1|4<br>(66.67%)|2<br>(33.33%)|0 (0%)|0<br>(0%)|3.67|Strongly<br>Agree|
|Q2|1<br>(16.67%)|4<br>(66.67%)|1<br>(16.67%)|0<br>(0%)|3.00|Agree|
|Q3|3<br>(50.00%)|3<br>(50.00%)|0 (0%)|0<br>(0%)|3.50|Strongly<br>Agree|
|Q4|4<br>(66.67%)|2<br>(33.33%)|0 (0%)|0<br>(0%)|3.67|Strongly<br>Agree|
|Q5|1<br>(16.67%)|5<br>(83.33%)|0 (0%)|0<br>(0%)|3.17|Agree|



Table 18. Assessment in Terms of Reliability 

For Reliability. Table 18 shows that the IT expert evaluators obtained an overall weighted mean of 3.40, interpreted as Strongly Agree, indicating that the proposed system reliably performs its intended functions. 

For Q1, the respondents obtained a weighted mean of 3.67, interpreted as Strongly Agree, indicating that the system performs its functions consistently without unexpected failures. Q2 obtained the lowest weighted mean of 3.00, interpreted as Agree, showing that the system remains available and operational, including during offline use. Meanwhile, Q3 obtained 3.50, indicating that the system recovers gracefully from errors without losing user data or progress. Q4 obtained the highest weighted mean of 3.67, showing that the system's translation and execution results are stable and repeatable across multiple attempts. Lastly, Q5 obtained 3.17, 

**105** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

interpreted as Agree, indicating that the evaluators are confident in the system's reliability. 

Overall, the findings indicate that the IT experts perceived PseudoPy as reliable, consistently performing its intended functions and producing stable, repeatable results. 

### **Performance Efficiency** 

For Performance Efficiency, the IT Expert evaluated the proposed system based on the following questions: 

Q1 - The system responds to user actions (translation, execution) within an acceptable time. 

Q2 - The system uses device resources (memory, processing) efficiently during operation. 

Q3 - The system maintains acceptable performance even with more complex pseudocode inputs. 

Q4 - The system's offline caching does not noticeably slow down normal use. Q5 - Overall, I am satisfied with the system's performance efficiency. 

|**QUESTION**|**SA f (%)**|**A f (5)**|**D f (%)**|**Sd**<br>**f(%)**|**Weighted**<br>**Mean**|**Interpretation**|
|---|---|---|---|---|---|---|
|Q1|6<br>(100.00%)|0 (0%)|0 (0%)|0<br>(0%)|4.00|Strongly<br>Agree|
|Q2|4<br>(66.67%)|2<br>(33.33%)|0 (0%)|0<br>(0%)|3.67|Strongly<br>Agree|
|Q3|5|1|0 (0%)|0|3.83|Strongly|



**106** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

||(83.33%)|(16.67%)||(0%)||Agree|
|---|---|---|---|---|---|---|
|Q4|3<br>(50.00%)|3<br>(50.00%)|0 (0%)|0<br>(0%)|3.50|Strongly<br>Agree|
|Q5|3<br>(50.00%)|3<br>(50.00%)|0 (0%)|0<br>(0%)|3.50|Strongly<br>Agree|



Table 19. Assessment in Terms of Performance Efficiency 

For **Performance Efficiency** . Table 19 shows that the IT expert evaluators obtained an overall weighted mean of 3.70, interpreted as Strongly Agree, indicating that the proposed system performs efficiently in terms of processing time and resource utilization. 

For Q1, the respondents obtained the highest weighted mean of 4.00, interpreted as Strongly Agree, indicating that the system responds to user actions, such as translation and execution, within an acceptable time. Q2 obtained a weighted mean of 3.67, showing that the system uses device resources such as memory and processing efficiently during operation. Meanwhile, Q3 obtained 3.83, indicating that the system maintains acceptable performance even with more complex pseudocode inputs. Q4 obtained the lowest weighted mean of 3.50, showing that the system's offline caching does not noticeably slow down normal use. Lastly, Q5 also obtained 3.50, indicating that the evaluators are satisfied with the system's performance efficiency. 

Overall, the findings indicate that the IT experts perceived PseudoPy as performing efficiently, maintaining acceptable response times and resource usage even under more demanding conditions. 

### **Maintainability** 

For Maintainability, the  IT Expert evaluated the proposed system based on the following questions: 

**107** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Q1 - The system's modular structure (separate parsing, translation, execution, and metrics components) supports straightforward updates. 

Q2 Errors or issues in one module can be diagnosed without affecting unrelated modules. 

Q3 - The system's design appears organized enough to support future modification. 

Q4 -New features or supported keywords could be added without extensive rework of the existing system. 

Q5 - Overall, I am confident in the system's maintainability. 

|**QUESTION**|**SA f (%)**|**A f (5)**|**D**<br>**f**<br>**(%)**|**Sd f(%)**|**Weighted**<br>**Mean**|**Interpretation**|
|---|---|---|---|---|---|---|
|Q1|4<br>(66.67%)|2<br>(33.33%)|0<br>(0%)|0 (0%)|3.67|Strongly<br>Agree|
|Q2|4<br>(66.67%)|2<br>(33.33%)|0<br>(0%)|0 (0%)|3.67|Strongly<br>Agree|



**108** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|Q3|2<br>(33.33%)|4<br>(66.67%)|0<br>(0%)|0 (0%)|3.33|Strongly<br>Agree|
|---|---|---|---|---|---|---|
|Q4|3<br>(50.00%)|3<br>(50.00%)|0<br>(0%)|0 (0%)|3.50|Strongly<br>Agree|
|Q5|4<br>(66.67%)|2<br>(33.33%)|0<br>(0%)|0 (0%)|3.67|Strongly<br>Agree|



Table 20. Assessment in Terms of Maintainability 

For Maintainability. Table 20 shows that the IT expert evaluators obtained an overall weighted mean of 3.57, interpreted as Strongly Agree, indicating that the proposed system is maintainable and can support future updates. 

For Q1, the respondents obtained a weighted mean of 3.67, interpreted as Strongly Agree, indicating that the system's modular structure, with separate parsing, translation, execution, and metrics components, supports straightforward updates. Q2 obtained the same weighted mean of 3.67, showing that errors or issues in one module can be diagnosed without affecting unrelated modules. Meanwhile, Q3 obtained the lowest weighted mean of 3.33, indicating that the system's design appears organized enough to support future modification. Q4 obtained 3.50, showing that new features or supported keywords could be added without extensive rework of the existing system. Lastly, Q5 obtained 3.67, indicating that the evaluators are confident in the system's maintainability. 

Overall, the findings indicate that the IT experts perceived PseudoPy as maintainable, with a modular design that supports isolated troubleshooting and future feature expansion. 

### **Portability** 

**109** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

For Portability, the IT Expert evaluated the proposed system based on the following questions: 

Q1 - The system runs consistently across different modern web browsers. Q2 - The system can be used on different types of devices (e.g., desktop, laptop) without loss of functionality. 

Q3 - The system becomes available for offline use (as a Progressive Web App) without significant difficulty. 

Q4 - The system's reliance on external dependencies (e.g., the Skulpt CDN) does not prevent it from working in different environments. 

Q5 - Overall, I am satisfied with the system's portability. 

|**QUESTION**|**SA f (%)**|**A f (5)**|**D**<br>**f**<br>**(%)**|**Sd**<br>**f(%)**|**Weighted**<br>**Mean**|**Interpretation**|
|---|---|---|---|---|---|---|
|Q1|6<br>(100.00%)|0 (0%)|0<br>(0%)|0 (0%)|4.00|Strongly<br>Agree|
|Q2|6<br>(100.00%)|0 (0%)|0<br>(0%)|0 (0%)|4.00|Strongly<br>Agree|
|Q3|4|2|0|0 (0%)|3.67|Strongly|



**110** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

||(66.67%)|(33.33%)|(0%)|||Agree|
|---|---|---|---|---|---|---|
|Q4|4<br>(66.67%)|2<br>(33.33%)|0<br>(0%)|0 (0%)|3.67|Strongly<br>Agree|
|Q5|5<br>(83.33%)|1<br>(16.67%)|0<br>(0%)|0 (0%)|3.83|Strongly<br>Agree|



Table 19. Assessment in Terms of Portability 

For **Portability** . Table 19 shows that the IT expert evaluators obtained an overall weighted mean of 3.83, interpreted as Strongly Agree, indicating that the proposed system can be adapted and deployed across different environments with ease. 

For Q1, the respondents obtained the highest weighted mean of 4.00, interpreted as Strongly Agree, indicating that the system runs consistently across different modern web browsers. Q2 also obtained the highest weighted mean of 4.00, showing that the system can be used on different types of devices, such as desktops and laptops, without loss of functionality. Meanwhile, Q3 obtained 3.67, indicating that the system becomes available for offline use, as a Progressive Web App, without significant difficulty. Q4 obtained the same weighted mean of 3.67, showing that the system's reliance on external dependencies, such as the Skulpt, does not prevent it from working in different environments. Lastly, Q5 obtained a weighted mean of 3.83, indicating that the evaluators are satisfied with the system's portability. 

Overall, the findings indicate that the IT experts perceived PseudoPy as portable, capable of running consistently across browsers and devices while remaining functional even with its offline and CDN dependencies. 

## **Overall Assessment of IT Expert** 

**111** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Table 20 summarizes the IT experts' overall evaluation of PseudoPy across the six quality characteristics based on ISO/IEC 25010. Among the six criteria, Usability and Portability received the highest weighted mean of 3.83, both interpreted as Strongly Agree, indicating that evaluators found the system easy to operate and able to function effectively across different devices and environments. This was followed by Functional Suitability (3.73) and Performance Efficiency (3.70), both also interpreted as Strongly Agree, showing that the system correctly performs its intended translation functions while maintaining acceptable processing speed and resource usage. Maintainability obtained a weighted mean of 3.57, indicating that the system's modular design supports future updates and troubleshooting. Reliability obtained the lowest weighted mean of 3.40, still interpreted as Strongly Agree, suggesting that while the system performs consistently overall, there is slightly more room for improvement in areas such as offline availability and error recovery. 

Overall, the IT experts obtained an overall weighted mean of 3.68, interpreted as Strongly Agree, indicating that PseudoPy is functionally suitable, usable, reliable, performant, maintainable, and portable. These results affirm that the proposed system meets the quality standards expected of a pseudocode-to-Python translation tool and is well-received by IT professionals as a technically sound and effective learning aid for pseudocode. 

|**Criterion**|**Overall Weighted Mean**|**Verbal Interpretation**|
|---|---|---|
|Functional Suitability|3.73|Strongly Agree|
|Usability|3.83|Strongly Agree|
|Reliability|3.40|Strongly Agree|
|Performance Efficiency|3.70|Strongly Agree|



**112** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|Maintainability|3.57|Strongly Agree|
|---|---|---|
|Portability|3.83|Strongly Agree|
|**Overall**|**3.68**|**Strongly Agree**|



Table 20. IT experts' overall evaluation of PseudoPy 

## **Implementation of Algorithm** 

### **1. Levenshtein Distance & Sentinel Suggestion** 

Calculates the minimum number of character edits needed to change one word into another. 

function compilerLevenshtein(a, b) { 

const m = a.length, n = b.length; 

const dp = []; for (let i = 0; i <= n; i++) dp[i] = [i]; for (let j = 0; j <= m; j++) dp[0][j] = j; 

for (let i = 1; i <= n; i++) { for (let j = 1; j <= m; j++) { if (b[i - 1] === a[j - 1]) { dp[i][j] = dp[i - 1][j - 1]; } else { dp[i][j] = Math.min( dp[i - 1][j - 1] + 1, dp[i][j - 1] + 1, dp[i - 1][j] + 1 ); } } } return dp[n][m]; } 

**113** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

function suggestSentinel(givenWord, candidates) { const upper = givenWord.toUpperCase(); let best = null, bestDist = Infinity; for (const kw of candidates) { const d = compilerLevenshtein(upper, kw); // Suggest only if it's a minor typo (distance 1 or 2) if (d < bestDist && d <= 2 && d > 0) { bestDist = d; best = kw; } } return best; } 

### **2. Unicode Operator Normalization** 

Used to ensure consistent parsing by converting various typographic or localized Unicode characters into standard programming symbols **.** 

- static UNICODE_OPERATOR_MAP = { '\u2265': '>=',   // ≥  GREATER-THAN OR EQUAL TO '\u2264': '<=',   // ≤   LESS-THAN OR EQUAL TO '\u2260': '!=',   // ≠  NOT EQUAL TO '\u2254': '=',    // ≔ COLON EQUALS (assignment) '\u00D7': '*',    // ×  MULTIPLICATION SIGN '\u2715': '*',    // ✕   MULTIPLICATION X '\u22C5': '*',    // ⋅ DOT OPERATOR (scalar multiply) '\u00F7': '/',    // ÷  DIVISION SIGN '\u2190': '=',    // ←  LEFTWARDS ARROW (assignment) '\u2192': '->',   // →  RIGHTWARDS ARROW '\u2261': '==',   // ≡  IDENTICAL TO '\u2011': '-',    // ‑ NON-BREAKING HYPHEN '\u2212': '-',    // −  MINUS SIGN '\u2013': '-',    // –  EN DASH (often typed as minus) '\u2014': '-',    // —  EM DASH 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **114** 

}; 

### **3. Recursive Decent Block Validation (LIFO Stack )** 

Used to verify the structural correctness of nested code blocks (like if/else, loops, or functions) and matching symbols (like (), {}, []). 

// ── LIFO stack pop with mismatch detection ── popBlock(expectedType, openLine) { if (this.blockStack.length === 0) { 

this.errors.push({ line: openLine, message: 'Unexpected END ' + expectedType + '. No matching ' + expectedType + ' block to close.' }); return; } const top = this.blockStack[this.blockStack.length - 1]; if (top.type === expectedType) { this.blockStack.pop(); } else { // Mismatch: e.g., opened FOR but closing IF this.errors.push({ line: openLine, message: 'Block mismatch: Expected END ' + top.type + ' (opened on line ' + top.line + ') but found END ' + expectedType + '.', suggestion: 'Close the innermost block first with END ' + top.type + '.' }); } 

### **4. Syntax-Directed Translation (SDT) & Indentation Tracking** 

Used to translate source code (e.g., pseudocode) into a target language (e.g., Python). SDT attaches translation rules to the grammar of the source language. When combined with indentation tracking, the system can parse block structures (like an ENDIF in pseudocode) and translate them into the syntactically correct indentation levels required by languages like Python. 

**115** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

visitNode(node) { 

if (!node) return; 

switch (node.type) { 

case 'IfStatement': 

// indent_level increases after THEN 

this.lines.push(this.ind() + 'if ' + this.exprToStr(node.condition.tokens) + ':'); 

this.indentLevel++; 

if (this.isBodyEffectivelyEmpty(node.body)) this.lines.push(this.ind() + 'pass'); else node.body.forEach(n => this.visitNode(n)); 

this.indentLevel--; // indent_level decreases after END IF 

if (node.elseIfs) { 

node.elseIfs.forEach(eif => { 

this.lines.push(this.ind() + 'elif ' + this.exprToStr(eif.condition.tokens) + ':'); this.indentLevel++; 

if (this.isBodyEffectivelyEmpty(eif.body)) this.lines.push(this.ind() + 'pass'); else eif.body.forEach(n => this.visitNode(n)); 

this.indentLevel--; 

}); } 

if (node.elseBody) { 

this.lines.push(this.ind() + 'else:'); 

this.indentLevel++; 

if (node.elseBody.length === 0) this.lines.push(this.ind() + 'pass'); 

else node.elseBody.forEach(n => this.visitNode(n)); 

this.indentLevel--; } break; // ... (similar SDT rules exist for WHILE, FOR, SET, DISPLAY) } } 

### **5. Code Normalization & Exact-Match Accuracy (EMA)** 

**116** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Used in automated code grading or equivalence testing. Code normalization strips away trivial stylistic differences (like extra whitespace, inline comments, or single vs. double quotes) to create a standardized version of the code. 

_normalizeCode(code) { if (!code) return ''; return code .split('\n') .map(line => line.replace(/\t/g, '    '))  // expand tabs → 4 spaces .map(line => { // Strip comments before code comparison let stripped = line.replace(/#.*$/, '').trimEnd(); // Normalise indentation: round to nearest 4-space boundary const match = stripped.match(/^(\s*)(.*)/); if (!match) return stripped; const [, leading, rest] = match; const spaces = leading.length; const normalSpaces = Math.round(spaces / 4) * 4; return ' '.repeat(normalSpaces) + rest; }) .filter(line => line.trim().length > 0)  // remove empty / whitespace-only lines .join('\n') .trimEnd(); } // Exact-Match Accuracy (EMA) Calculation // B. Accuracy = (exact matches / total) × 100 const accuracy = parseFloat(((exactMatches / n) * 100).toFixed(1)); 

## **6. Line-Level Precision, Recall, and F1-Score** 

Used to evaluate the performance of code generation models, diff tools, or student submissions 

**_** calculatePRF(normGenerated, normExpected) { 

**117** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

|const genLines = normGenerated.split('\n').filter(l => l.trim().length > 0);<br>const expLines = normExpected.split('\n').filter(l => l.trim().length > 0);<br>if (genLines.length === 0 && expLines.length === 0) return { precision: 1, recall: 1, f1: 1 };<br>if (genLines.length === 0 || expLines.length === 0) return { precision: 0, recall: 0, f1: 0 };<br>const expSet = new Set(expLines);<br>const genSet = new Set(genLines);|
|---|
|// Matching lines in generated that exist in expected<br>let matchingInGen = 0;<br>for (const line of genLines) {<br>if (expSet.has(line)) matchingInGen++;<br>}<br>// Matching lines in expected that exist in generated<br>let matchingInExp = 0;<br>for (const line of expLines) {<br>if (genSet.has(line)) matchingInExp++;<br>}<br>// Precision = Matching Lines / Total Lines in Generated Code<br>const precision = matchingInGen / genLines.length;|
|// Recall = Matching Lines / Total Lines in Ground Truth<br>const recall = matchingInExp / expLines.length;<br>// F1 Score = 2 × (Precision × Recall) / (Precision + Recall)<br>// Edge-case: if Precision + Recall = 0, return F1 = 0.0<br>const f1 = (precision + recall > 0)<br>? (2 * precision * recall) / (precision + recall)<br>: 0.0;|
|return { precision, recall, f1 };<br>}<br>**7.  Logic Gap Analysis (Static Program Analysis)**|



**118** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

Used to detect bugs, vulnerabilities, or missing requirements without executing the code. 

analyzeLogicGap(studentCode, solutionCode) { 

if (!solutionCode) return { match: true, reason: 'No ground truth provided for this exercise.' }; const studentTokens  = this._tokenize(studentCode); const solutionTokens = this._tokenize(solutionCode); 

const studentKeywords  = this._getKeywordCounts(studentTokens); 

const solutionKeywords = this._getKeywordCounts(solutionTokens); const gaps = []; 

const importantKeywords = ['IF', 'WHILE', 'FOR', 'BEGIN', 'END']; 

for (const kw of importantKeywords) { const sc = studentKeywords[kw]  || 0; const ex = solutionKeywords[kw] || 0; const diff = sc - ex; if (diff < 0) { 

gaps.push({ type: 'Missing Structure', concept: kw, message: `Missing ${Math.abs(diff)} '${kw}' block(s).`, rootCause: `Instructor's solution uses ${ex} ${kw} structure(s); yours uses ${sc}.` }); } else if (diff > 0) { gaps.push({ type: 'Extra Complexity', concept: kw, message: `Redundant '${kw}' block(s) detected.`, rootCause: `Problem needs only ${ex} ${kw} structure(s). You added ${diff} extra.` }); } } return { match: gaps.length === 0, gaps, summary: gaps.length === 0 ? 'Logical alignment: Excellent' : 'Logic Analysis Required' }; } 

**119** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **8. Tokenization** 

Identifies whether a word is a keyword or a variable name. 

const upper = word.toUpperCase(); if (COMPILER_KEYWORDS.has(upper)) { this.tokens.push({ type: TOKEN_TYPES.KEYWORD, value: upper, line: startLine }); } else { this.tokens.push({ type: TOKEN_TYPES.IDENTIFIER, value: word, line: startLine }); } 

## **9. Recursive-Descent Parsing** 

|Calls the appropriate parsing method for each statement.|
|---|
|case 'DECLARE': return this.parseDeclare();|
|case 'SET': return this.parseSet();|



**120** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF COMPUTING STUDIES**|
|---|
|case 'PRINT':<br>case 'DISPLAY':<br>case 'OUTPUT': return this.parsePrint();<br>case 'INPUT':<br>case 'READ': return this.parseInput();<br>case 'IF': return this.parseIf();<br>case 'WHILE': return this.parseWhile();<br>case 'FOR': return this.parseFor();|
|**10. Stack-Based Validation**|
|Check the most recently opened block before removing it from the stack.|
|const top = this.blockStack[this.blockStack.length - 1];|
|if (top.type === expectedType) {<br>this.blockStack.pop();<br>} else {<br>this.errors.push({<br>line: openLine,<br>message: 'Block mismatch: Expected END ' + top.type<br>+ ' (opened on line ' + top.line<br>+ ') but found END ' + expectedType + '.',|
|suggestion: 'Close the innermost block first with END '|



**121** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
            + top.type + '.'<br>    });<br>}<br>11. Symbol-Table Checking<br>Warns when an assignment uses a variable that has not been declared.<br>if (!this.symbolTable.has(node.id)) {<br>    this.warnings.push({<br>        line: node.line,<br>        message: "Variable '" + node.id + "' used without DECLARE.",<br>        suggestion: 'Add: DECLARE ' + node.id<br>            + ' AS INTEGER (or appropriate type)'<br>    });<br>}<br>12. Syntax-Directed Code Generation<br>Converts assignment and output statements into Python code.<br>case 'AssignmentStatement':<br>    this.lines.push(<br>        this.ind() + node.id + ' = '<br>        + this.exprToStr(node.expr.tokens)<br><!-- End of picture text -->

**122** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
    );<br>    break;<br>case 'PrintStatement': {<br>    const s = this.smartPrintExpr(node.expr.tokens);<br>    this.lines.push(this.ind() + 'print(' + s + ')');<br>    break;<br>}<br><!-- End of picture text -->

## **CHAPTER V** 

### **SUMMARY OF FINDINGS, CONCLUSIONS, AND RECOMMENDATIONS** 

This chapter summarizes the findings, conclusions, and recommendations of the study entitled Translating Pseudocode to Python: An Algorithmic Approach to Automated Code Generation. The study focused on developing and evaluating PseudoPy, a system designed to translate pseudocode into executable Python code 

**123** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

using Syntax-Directed Translation (SDT), Context-Free Grammar (CFG), mapping, validation, and a hybrid translation process. The findings are presented according to the study's six Statements of the Problem. This chapter also discusses conclusions drawn from the results and recommendations for improving and expanding the system in the future. 

The following sections present the significant findings from the system development and the evaluation conducted among the respondents. The summary of significant findings restates the results discussed in Chapter IV for each specific problem. 

### **Summary of Significant Findings** 

This section presents the study's significant findings based on the Statement of the Problem. The findings were derived from the development and evaluation of PseudoPy, particularly its application of Syntax-Directed Translation, mapping and validation mechanism, pseudocode-to-Python translation performance, and system performance. The findings also include assessments from students and instructors and an evaluation by IT experts based on selected ISO/IEC 25010 quality criteria. Each finding directly addresses its corresponding specific problem of the study. 

1.  The findings showed that the application of Syntax-Directed Translation (SDT) influences the translation outcome of PseudoPy by associating the structures recognized through the Context-Free Grammar (CFG) with corresponding Python constructs. The CFG establishes the valid structure of the pseudocode, while the Parser recognizes these structures and represents them through an Abstract Syntax Tree (AST). The SDT CodeGenerator then traverses the AST and applies the appropriate translation rules to generate Python code. In this process, the different stages of the translation pipeline work together to ensure that the pseudocode is properly analyzed, validated, and transformed into its corresponding Python representation. The Lexer identifies keywords, 

**124** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

identifiers, numbers, strings, and operators, while the recursive-descent Parser validates the CFG rules and constructs the AST. The AST serves as the connection between CFG recognition and SDT translation because it preserves the structural relationships needed during code generation. Building on this structured representation, the SDT CodeGenerator applies specific translation rules to AST nodes and manages Python indentation to preserve the structure of nested pseudocode blocks. Semantic analysis also checks conditions such as undeclared variables and inappropriate mathematical operations before code generation, while error-handling mechanisms, including the correction of certain unclosed blocks and incorrectly entered keywords, further support the translation process. Once the translation is completed, the generated output is then subjected to execution and evaluation to determine whether the resulting Python code can function within the supported environment. The generated Python code is executed through Skulpt, allowing the system to determine whether the generated output is executable. The system also uses a ground-truth dataset and quantitative metrics, including accuracy, precision, recall, and F1-score, to examine translation outcomes. Taken as a whole, these findings demonstrate that the components of PseudoPy operate as a continuous CFG-SDT translation process, in which the CFG defines the valid structure, the Lexer identifies the input elements, the Parser validates and represents the structure through the AST, SDT performs the translation, semantic analysis provides additional validation, and the resulting Python code is generated and executed. 

2. The findings showed that the mapping model with a validation mechanism in PseudoPy provides a structured approach to code generation by combining input normalization, Context-Free Grammar (CFG) enforcement, Abstract Syntax Tree (AST) construction, semantic validation, and structured code generation. Unlike simpler direct or line-based translation approaches, PseudoPy maps, analyzes, validates, and structures the pseudocode before producing the corresponding Python code, allowing structural and semantic 

**125** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

issues to be identified before execution. In terms of code-generation correctness, PseudoPy obtained an F1-score of 54.9%, with a precision of 41.6% and recall of 80.7%, which was approximately 18.1% higher than the 46.5% midpoint of the 35–58% correctness range reported in the cited literature for traditional or unvalidated approaches. This result indicates that the mapping and validation process contributed to improved correctness when compared with the literature-based reference range, although the comparison does not represent a controlled comparison because no separate baseline system was tested in the study. In terms of syntax and runtime errors, PseudoPy achieved a 100% compile rate across the 30 ground-truth test cases, resulting in a recorded error rate of 0% within the tested dataset. When compared with the 45% midpoint of the 38–52% error range reported in the cited literature, this represents a 100% reduction in the reported error rate; however, this result reflects PseudoPy's own test cases and should not be interpreted as a direct experimental comparison with a control group. Furthermore, PseudoPy achieved an average generation time of 0.75 milliseconds per test case, which is substantially lower than the 1,200–3,500 millisecond latency reported for cloud-based program synthesis models in the cited literature, consistent with PseudoPy's client-side processing architecture. Taken together, these findings indicate that the mapping and validation mechanism provides PseudoPy with a structured process for improving codegeneration correctness, identifying errors before execution, and producing translations efficiently, while the comparisons with traditional and cloud-based approaches should be understood as literature-based contextual comparisons rather than results from a directly tested baseline. 

3. The findings showed that the hybrid model and transformation logic of PseudoPy were able to convert the tested pseudocode inputs into executable Python code through the combined operation of the system's core algorithms and CFG-SDT translation pipeline. The hybrid model integrates sequential parsing, stack-based syntax validation, Levenshtein Distance for keyword 

**126** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

correction, and linear search for semantic analysis with the CFG-SDT process to analyze, validate, and transform the pseudocode into Python. The performance of the hybrid model was evaluated using 30 ground-truth test cases covering different algorithmic constructs, including While Loop Mathematical Series, Modulo Branching Logic, In-Place Array Transformation, Factorial Computation, and Array Filtering. Based on the results, PseudoPy achieved an overall compile rate of 100%, indicating that all 30 generated outputs were successfully compiled without syntax or runtime errors. However, the Exact Match Accuracy was 0%, meaning that none of the generated outputs matched the instructor-provided reference solutions character-for-character. This result should not be interpreted as an absence of successful translation because Exact Match is a strict measure that considers differences in variable naming, spacing, and statement ordering as mismatches. This is further supported by the overall Precision of 41.6% and Recall of 80.7%, resulting in an F1-Score of 54.9%, which indicates that the generated outputs captured a substantial portion of the expected logical structures while also containing additional or differently structured lines compared with the reference solutions. The While Loop Mathematical Series construct obtained the highest Precision and Recall at 88% and 100%, respectively, while the In-Place Array Transformation and Modulo Branching Logic constructs showed lower Precision values of 25% and 41%, indicating greater structural differences from their corresponding reference solutions. Despite these differences, all tested outputs compiled successfully and were executable within the supported environment. Furthermore, the hybrid model achieved an overall average generation time of 0.17 milliseconds across the 30 test cases, demonstrating that the translation process was completed rapidly through PseudoPy's clientside processing architecture. Overall, the findings indicate that the hybrid model successfully generated syntactically valid and executable Python code while preserving a substantial portion of the expected logical structures, although 

**127** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

variations between generated outputs and instructor reference solutions affected the Exact Match, Precision, Recall, and F1-Score results. 

4. The findings showed that the Metrics Engine of PseudoPy provides measurable performance indicators for evaluating automated pseudocode-to-Python translation using the ground-truth dataset. The evaluation covered accuracy, precision, compilation success rate, execution time, and runtime error rate, with recall and F1-score also included as supporting performance measures. Based on the aggregate results, PseudoPy obtained an Exact Match Accuracy of 0% across the 30 test cases, indicating that none of the generated Python outputs matched the ground-truth reference solutions character-for-character. However, this result reflects the strict nature of the Exact Match metric, which considers differences in variable naming, line ordering, and formatting as mismatches even when the underlying logical structure may be preserved. In terms of Precision, PseudoPy obtained 41.6%, indicating that a portion of the generated lines matched the reference solutions while other generated lines were additional or differently structured. The system also achieved a Recall of 80.7% and an F1-Score of 54.9%, providing additional measures of how much of the expected logical content was captured by the generated code. For Compilation Success Rate, PseudoPy achieved 100% across all 30 test cases, indicating that all generated outputs successfully passed through the parsing and code-generation process without recorded syntax errors. In terms of Execution Time, the Metrics Engine recorded an average processing time of 0.0005 seconds, or 0.5 milliseconds, per test case, with the Parser accounting for the largest portion of the measured compiler-stage time at 0.425 milliseconds, followed by Semantic Analysis at 0.325 milliseconds, the Lexer at 0.15 milliseconds, and Code Generation at 0.125 milliseconds. For Runtime Error Rate, PseudoPy recorded 0%, which corresponds to the 100% compilation and execution outcome reported through the system's Skulptbased execution architecture. Overall, the findings demonstrate that the Metrics Engine provides quantitative measurements of PseudoPy's translation 

**128** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

performance, showing successful compilation and rapid processing while also revealing differences between the generated outputs and the ground-truth reference solutions through the Exact Match, Precision, Recall, and F1-Score results. 

5. The findings showed that the Metrics Engine of PseudoPy provides measurable performance indicators for evaluating automated pseudocode-to-Python translation using the ground-truth dataset. The evaluation covered accuracy, precision, compilation success rate, execution time, and runtime error rate, with recall and F1-score also included as supporting performance measures. Based on the aggregate results, PseudoPy obtained an Exact Match Accuracy of 0% across the 30 test cases, indicating that none of the generated Python outputs matched the ground-truth reference solutions character-for-character. However, this result reflects the strict nature of the Exact Match metric, which considers differences in variable naming, line ordering, and formatting as mismatches even when the underlying logical structure may be preserved. In terms of Precision, PseudoPy obtained 41.6%, indicating that a portion of the generated lines matched the reference solutions while other generated lines were additional or differently structured. The system also achieved a Recall of 80.7% and an F1-Score of 54.9%, providing additional measures of how much of the expected logical content was captured by the generated code. For Compilation Success Rate, PseudoPy achieved 100% across all 30 test cases, indicating that all generated outputs successfully passed through the parsing and code-generation process without recorded syntax errors. In terms of Execution Time, the Metrics Engine recorded an average processing time of 0.0005 seconds, or 0.5 milliseconds, per test case, with the Parser accounting for the largest portion of the measured compiler-stage time at 0.425 milliseconds, followed by Semantic Analysis at 0.325 milliseconds, the Lexer at 0.15 milliseconds, and Code Generation at 0.125 milliseconds. For Runtime Error Rate, PseudoPy recorded 0%, which corresponds to the 100% compilation and execution outcome reported through the system's Skulpt- 

**129** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

based execution architecture. Overall, the findings demonstrate that the Metrics Engine provides quantitative measurements of PseudoPy's translation performance, showing successful compilation and rapid processing while also revealing differences between the generated outputs and the ground-truth reference solutions through the Exact Match, Precision, Recall, and F1-Score results. 

6. The findings showed that the proposed PseudoPy system was positively assessed by the 24 end users, consisting of 18 students and 6 instructors, in terms of Usability, Learnability, Efficiency, and Reliability. Among the four criteria, Usability obtained the highest overall weighted mean of 3.70, interpreted as Strongly Agree, indicating that the respondents found the system interface understandable, its layout clear and organized, navigation straightforward, and instructions easy to follow. Efficiency followed with an overall weighted mean of 3.65, also interpreted as Strongly Agree, showing that the respondents perceived the system as responsive, smooth, and capable of providing fast performance during use. Reliability obtained a weighted mean of 3.57, interpreted as Strongly Agree, indicating that the respondents generally perceived the system as capable of performing its intended translation functions and supporting its purpose as a learning tool. Learnability received the lowest criterion-level weighted mean of 3.52, but it was still interpreted as Strongly Agree, indicating that the respondents found the system understandable and helpful in developing their understanding of pseudocode, programming logic, and pseudocode writing. The combined overall weighted mean of 3.61 was also interpreted as Strongly Agree, showing that the students and instructors generally assessed PseudoPy positively across all four evaluation criteria. These findings represent the respondents' assessment of the system and are distinct from the objective performance measures used to evaluate the automated translation process. 

**130** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **Conclusions** 

Based on the findings of the study, the following conclusions were drawn: 

1. The study concludes that Syntax-Directed Translation can be applied to the PseudoPy system to convert recognized pseudocode structures into corresponding Python code. The combination of CFG and SDT provided a structured translation process in which valid pseudocode structures could be transformed into Python outputs. This shows that SDT can serve as an appropriate approach for the translation process used by the proposed system. 

2. Based on the findings, the mapping model with a validation mechanism provides PseudoPy with a systematic process for converting pseudocode into Python by ensuring that the input is first normalized, structurally analyzed, semantically validated, and then translated into code. The results showed improved code-generation correctness, no recorded syntax or runtime errors across the tested ground-truth cases, and fast generation time through client-side processing. These findings indicate that the validation mechanism supports the identification of structural and semantic issues before code execution, while the mapping process helps maintain the relationship between the pseudocode input and the generated Python output. Although the comparisons with traditional and cloud-based approaches were based on published literature rather than a directly tested control group, the results provide evidence that the mapping and validation mechanism is a relevant component of PseudoPy's translation process. 

3. Based on the findings, the hybrid model and transformation logic of PseudoPy provide a structured mechanism for converting pseudocode into Python through the combined use of sequential parsing, syntax validation, keyword correction, semantic analysis, and the CFG-SDT 

**131** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

translation pipeline. The 100% compile rate across the 30 test cases demonstrates that the generated outputs were successfully compiled and executed without recorded syntax or runtime errors. At the same time, the 0% Exact Match result shows that the generated code did not exactly reproduce the instructor reference solutions, while the 41.6% Precision, 80.7% Recall, and 54.9% F1-Score indicate that the generated outputs still captured a substantial portion of the expected logical structures. The differences were more evident in constructs such as In-Place Array Transformation and Modulo Branching Logic, whereas While Loop Mathematical Series produced the highest Precision and Recall results. The average generation time of 0.17 milliseconds also demonstrates that the hybrid translation process operates efficiently through client-side processing. Therefore, the findings indicate that PseudoPy's hybrid model can generate executable Python code while preserving many of the logical structures represented in the reference solutions, although further refinement of the transformation rules may be needed to reduce structural differences between generated outputs and instructor-validated solutions. 4. Based on the findings, the Metrics Engine provides a measurable basis for evaluating the performance of PseudoPy in automated pseudocodeto-Python translation. The results showed a 0% Exact Match Accuracy, 41.6% Precision, 80.7% Recall, and 54.9% F1-Score, indicating that although the generated outputs did not exactly reproduce the reference solutions, they captured a substantial portion of the expected logical content. The system also achieved a 100% Compilation Success Rate and a 0% Runtime Error Rate across the tested cases, while recording an average processing time of 0.0005 seconds per test case. These results demonstrate that the Metrics Engine can identify both the successful execution characteristics of the system and the differences between generated outputs and reference solutions. Therefore, the metrics provide a quantitative basis for assessing PseudoPy's translation 

**132** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

performance and identifying areas where the transformation logic can be further refined. 

5. Based on the findings, the proposed PseudoPy system was assessed positively by the participating students and instructors in terms of Usability, Learnability, Efficiency, and Reliability. The overall weighted mean of 3.61, interpreted as Strongly Agree, indicates that the respondents generally found the system understandable, learnable, efficient, and reliable for its intended use. The highest criterion-level result was Usability at 3.70, followed by Efficiency at 3.65, Reliability at 3.57, and Learnability at 3.52. Although the weighted means differed across the criteria, all four remained within the Strongly Agree range. The results therefore support the intended use of PseudoPy as a learning-oriented system for translating pseudocode into Python and assisting users in practicing programming and algorithmic logic. However, these findings describe the perceptions of the participating end users and should be considered separately from objective measures such as accuracy, precision, recall, F1-score, compilation success rate, runtime error rate, and execution time. 

6. Based on the findings, the proposed PseudoPy system was assessed positively by the IT expert evaluators across the six selected ISO/IEC 25010 quality criteria. The overall weighted mean of 3.68, interpreted as Strongly Agree, indicates that the evaluators generally perceived the system as functionally suitable, usable, reliable, efficient, maintainable, and portable for its intended purpose. Usability and Portability received the highest weighted mean of 3.83, followed by Functional Suitability at 3.73, Performance Efficiency at 3.70, Maintainability at 3.57, and Reliability at 3.40. Although Reliability received the lowest criterion-level rating, it remained within the Strongly Agree range, indicating an overall positive assessment while identifying areas such as offline availability, error recovery, and confidence in reliability where further refinement may 

**133** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

be considered. Overall, the IT expert evaluation supports the quality of the proposed PseudoPy system based on the selected ISO/IEC 25010 criteria and indicates that the system provides the intended functions while maintaining usability, performance, maintainability, and portability. 

### **Recommendations** 

Based on the findings, conclusions, and scope and limitations of the study, the following recommendations are proposed: 

1. Future developers may improve the current rule-based validation so that it is less strict when students use different but logically understandable ways of writing pseudocode. The system should still maintain the required structure and correctness, but it may allow more acceptable variations in pseudocode writing. This can help reduce errors caused only by differences in syntax while keeping the translation process controlled. 

2. The system may provide clearer and more understandable feedback when a student's pseudocode does not follow the supported format. Instead of simply rejecting the input, the system may explain what part of the pseudocode needs to be changed and provide examples of acceptable alternatives. This can help students understand their mistakes instead of repeatedly trying different inputs without knowing the reason for the error. 

3. Future researchers may expand the range of pseudocode structures supported by PseudoPy. The current study focuses mainly on core programming logic and has limitations regarding complicated Python libraries, file input/output, object-oriented programming, and complex 

**134** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

data structures. Future versions may gradually include additional programming concepts as the system is developed further. 

4. Future versions of PseudoPy may allow students and instructors to edit their basic profile information. The system may also allow users to add or change a profile picture or avatar instead of using only the default profile icon. This can make the system more personalized and can also make it easier to identify users, especially when different roles are using the same platform. 

5. Future researchers may explore extending PseudoPy to support Java in addition to Python. Java can be useful for students who are learning or preparing for Object-Oriented Programming (OOP). Supporting another programming language can also allow students to see how the same pseudocode logic can be represented using different programming languages. This should be considered as a future expansion and is not part of the current implementation. 

6. Since Reliability received the lowest weighted mean among the six ISO/IEC 25010 criteria, future developers may further improve system availability and error recovery. The system may be tested under more situations, including different devices, browser conditions, offline situations, and possible execution or dependency failures. Improvements in these areas may help make the system more dependable for continuous classroom use. 

7. Future researchers may conduct additional testing with more students, instructors, and IT professionals from different institutions. A larger set of pseudocode and Python test cases may also be used to examine how the system performs across more programming structures. This 

**135** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

can provide more information about the system's performance beyond the cases included in the current study. 

8. Future researchers may continue exploring the possibility of supporting additional programming languages and learning features. Since the current study is focused on pseudocode-to-Python translation, future work may investigate how the same approach can be extended to other programming languages while maintaining the system's educational purpose. 

9. Overall, future improvements should focus on making PseudoPy more flexible for students while maintaining the correctness and reliability of its translation process. The goal should not only be to generate code successfully, but also to provide a learning environment where students can express their algorithmic ideas, understand errors, and gradually improve their programming skills. 

## **Literature Cited** 

1. R. Weeda, S. Smetsers, and E. Barendsen, “Unraveling novices’ code composition difficulties,” _Computer Science Education_ , vol. 34, no. 3, pp. 414– 441, 2024. 

**136** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

2. S. P. Tiwari _et al._ , “Challenges in Translating Algorithmic Logic to Syntactically Correct Python Code,” in _Proc. IEEE International Conference on Computing, Communication and Automation (ICCCA)_ , 2023, pp. 145–150. 

3. T. Winkler, A. Scholl, and M. E. K. Berg, “Cognitive overload in introductory programming: The impact of syntax on problem-solving focus,” _ACM Transactions on Computing Education_ , vol. 24, no. 2, pp. 1–25, 2024. 

4. S. Acharjee, “Anyone can code: Algorithmic thinking,” _IEEE Access_ , vol. 10, pp. 26730–26742, 2022 

5. B. Wang _et al._ , “Bridging the gap between pseudocode and program implementation: Student difficulties and common errors,” _Journal of Computer Science Education_ , vol. 33, no. 1, pp. 45–68, 2023. 

6. A. Alokla, W. Gad, W. Nazih, M. Aref, and A.-B. Salem, “Retrieval-based transformer pseudocode generation,” _Mathematics_ , vol. 10, no. 4, p. 612, 2022. 

7. H. Keuning, J. Jeuring, and B. Heeren, “A systematic evaluation of automated feedback in introductory programming education,” _Computer Science Education_ , vol. 33, no. 2, pp. 145–178, 2023. 

8. R. Olsen, "Deep learning pseudocode generation: A qualitative analysis," Master's thesis, Santa Clara University, Santa Clara, CA, USA, 2022. 

9. InterServer, "How to write pseudocode and convert it to Python," _InterServer Tips Knowledge Base_ , 2025. 

10. PiyuSCS, "Converting pseudocode to programs: Step-by-step guide with examples," 2025. 

11. BBC Open Source, "Pseudocode to Python translation," _VC2 Pseudocode Parser_ , 2022. 

12. [12 B. Stroustrup, _The C++ Programming Language_ , 5th ed. Boston, MA, USA: Addison-Wesley, 2022. 

13. K. Taheri, M. R. Khosravi, and H. Fathi, "Applications of Levenshtein distance in modern string matching and error correction algorithms," _J. Inf. Process. Syst._ , vol. 18, no. 4, pp. 897–912, 2022. 

14. B. A. Becker, K. Quille, and A. McGowan, "Developing and validating a competency-based assessment framework for introductory programming," _ACM Trans. Comput. Educ._ , vol. 24, no. 3, pp. 1–28, 2024. 

**137** 

**COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

15. D. Nam, A. Macvean, V. Hellendoorn, B. Vasilescu, and B. Myers, "Studying the effect of AI code generators on supporting novice learners in introductory programming," in _Proc. CHI Conference on Human Factors in Computing Systems_ , 2023, pp. 1-23 

16. M. Kazemitabaar et al., "Studying the effect of AI code generators on supporting novice learners in introductory programming," _Journal of Computer Science Education_ , vol. 15, no. 2, pp. 189-212, 2024. 

17. J. Leinonen et al., "PyDex: Repairing bugs in introductory Python assignments using LLMs," _ACM Transactions on Computing Education_ , vol. 24, no. 2, pp. 1- 27, 2024. doi: 10.1145/3649850 

18. R. Van der Meer, "Investigating the influence of code generating technologies on learning process of novice programmers in higher education computer science course," Master's thesis, University of Twente, Enschede, Netherlands, 2023 

19. N. C. Wordu, “The challenges of computer science education in the 21st century in a developing economy,” American Journal of Social and Humanitarian Research, vol. 3, no. 2, 2022. 

20. R. Olsen, "Deep learning pseudocode generation: A qualitative analysis," Master's thesis, Santa Clara Univ., Santa Clara, CA, USA, 2022. 

21. A. Hundhausen and S. Brown, “Algorithm visualization in computer science education: A systematic review,” ACM Transactions on Computing Education, vol. 23, no. 2, 2023 

22. Python Software Foundation, "Python Documentation," 2024. 23. TechTarget, "Pseudocode to Python translation: Best practices and implementation," 2025. 

24. GPT-4.1 Benchmarking Study, "Comparative analysis of LLM performance in Python code generation," 2025. 

25. Nanyang Technological University, "Converting pseudocode into Python functions for teaching greedy algorithms," Final Year Project, School of Computer Science and Engineering, Nanyang Technological University, Singapore, 2024. 

26. R. Van der Meer, "Investigating the influence of code generating technologies on learning process of novice programmers in higher education computer science course," Master's thesis, Univ. Twente, Enschede, Netherlands, 2023.. 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF COMPUTING STUDIES**|
|---|
|27. IEEE, *ISO/IEC/IEEE 24765:2017 Systems and Software Engineering —<br>Vocabulary*, IEEE/ISO/IEC Standard.|
|28. S. Muchnick, Advanced Compiler Design and Implementation, 2nd ed., San<br>Francisco, CA, USA: Morgan Kaufmann, 2022.|
|29. B. W. Kernighan and D. M. Ritchie, The C Programming Language: Modern<br>Edition, 2nd ed., Boston, MA, USA: Pearson, 2023.|
|30. 30] B. Stroustrup, The C++ Programming Language, 5th ed., Boston, MA, USA:<br>Addison-Wesley, 2022.|
|31. Oracle, "The Java Language Environment,"_Oracle Documentation_, 2024.|
|32. B. A. Becker, K. Quille, and A. McGowan, "Developing and validating a<br>competency-based assessment framework for introductory programming,"_ACM_<br>_Trans. Comput. Educ._, vol. 24, no. 3, pp. 1-28, 2024. doi: 10.1145/3651154|
|33. D. Weintrop and U. Wilensky, "Comparing block-based and text-based<br>programming in high school computer science classrooms,"_ACM Trans._<br>_Comput._ _Educ._, vol. 22, no. 1, pp. 1-25, 2022. doi: 10.1145/3487053|
|34. H. Keuning, J. Jeuring, and B. Heeren, "A systematic evaluation of automated<br>feedback in introductory programming education,"_Comput. Sci. Educ._, vol. 33,<br>no. 2,pp. 145-178, 2023. doi: 10.1080/08993408.2023.2178456|
|35. G. Tetteh, "Empirical Study of Agile Software Development Methodologies: A<br>Comparative Analysis,"_ResearchGate_, 2024. [Online]. Available:|
|36. T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein,_Introduction to_<br>_Algorithms_, 4th ed. Cambridge, MA, USA: MIT Press, 2022. [Online]. Available:|
|37. T. H. Cormen, C. E. Leiserson, R. L. Rivest, and C. Stein, *Introduction to<br>Algorithms*, 4th ed. Cambridge, MA, USA: MIT Press, 2022.|
|38. G. A. V. Pai,_A Textbook of Data Structures and Algorithms_. Hoboken, NJ, USA:<br>Wiley, 2023.|
|39. S. Muchnick, Advanced Compiler Design and Implementation, 2nd ed., San<br>Francisco, CA, USA: Morgan Kaufmann, 2022.|
|40. K. Taheri, M. R. Khosravi, and H. Fathi, “Applications of Levenshtein distance in<br>modern string matching and error correction algorithms,” Journal of Information<br>Processing Systems, vol. 18, no. 4, pp. 897–912, 2022.|
|41._Phases of a Compiler_— GeeksforGeeks (overview of lexical, syntax, semantic,<br>and code generation phases.|



## **138** 

**139** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

|**COLLEGE OF COMPUTING STUDIES**|
|---|
|42._Semantic Analysis (compilers)_— Wikipedia (semantic checks in compilers)|
|43._Compiler Design: Syntax-Directed Translation_— TutorialsPoint (explains how<br>code generation works and how translations are structured):|
|44. A. Adeoye, “Purposive Sampling,” in Purposive Sampling: Concepts and<br>Applications in Scientific Research, ResearchGate Publication, Nov. 2025.|
|45. Wikipedia, “Syntax-directed translation**.”**Available:<br>https://en.wikipedia.org/wiki/Syntax-directed_translation|
|46. University of Washington, CSE P 501, “Abstract Syntax Trees (ASTs),” lecture<br>note**s.**Available:<br>https://courses.cs.washington.edu/courses/csep501/18sp/lectures/H-ASTs.pdf|
|47. Wikipedia, “Levenshtein distance**.”**Available:<br>https://en.wikipedia.org/wiki/Levenshtein_distance|
|48. Skulpt, “Skulpt — Python. Client Side**.”**Available: https://skulpt.org/|
|49. Mozilla Developer Network, “Service Worker API.**”**Available:<br>https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API|
|50. Mozilla, “pdf.js**” GitHub repository.**Available: https://github.com/mozilla/pdf.js|
|51. Wikipedia, “Constructivism (philosophy of education**).”**Available:<br>https://en.wikipedia.org/wiki/Constructivism_(philosophy_of_education)|
|52. Wikipedia, “Cognitive load**.”**Available:<br>https://learnlab.org/research/wiki/index.php/Cognitive_load|
|53. Wikipedia**, “F-score.”**Available: https://en.wikipedia.org/wiki/F-score|
|[55] Wikipedia, "Syntax-directed translation." [Online]. Available:<br>https://en.wikipedia.org/wiki/Syntax-directed_translation|
|[56] Univ. of Washington, CSE P 501, "Abstract Syntax Trees (ASTs)," lecture<br>notes. [Online]. Available:<br>https://courses.cs.washington.edu/courses/csep501/18sp/lectures/H-<br>ASTs.pdf|
|[57] Wikipedia, "Levenshtein distance." [Online]. Available:<br>https://en.wikipedia.org/wiki/Levenshtein_distance|
|[58] Skulpt, "Skulpt — Python. Client Side." [Online]. Available: https://skulpt.org/|
|[59] Mozilla Developer Network, "Service Worker API." [Online]. Available:<br>https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API|



**140** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

- [60] Mozilla, "pdf.js" GitHub repository. [Online]. Available: https://github.com/mozilla/pdf.js 

- [61] Wikipedia, "Constructivism (philosophy of education)." [Online]. Available: https://en.wikipedia.org/wiki/Constructivism_(philosophy_of_education) 

- [62] Wikipedia, "Cognitive load." [Online]. Available: 

   - https://learnlab.org/research/wiki/index.php/Cognitive_load 

- [63] Wikipedia, "F-score." [Online]. Available: https://en.wikipedia.org/wiki/Fscore 

## **Appendices** 

**141** 



<!-- Start of picture text -->
Guiversity of Cabupyao<br>(PAMANTASAN NG CABUYAQO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

A Confidentiality and Non-Disclosure Agreement 



<!-- Start of picture text -->
| osmemenapgnce<br>-<br><!-- End of picture text -->



<!-- Start of picture text -->
—<br>[ mcr rodoertn e tetm<br>[erect meme<br>a ents ts<br><!-- End of picture text -->

**COLLEGE OF COMPUTING STUDIES 142** 

**143** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 



<!-- Start of picture text -->
B Validated Research Instrument/s<br><!-- End of picture text -->



<!-- Start of picture text -->
a<br>PIC PRE-FO-29rev) 02202023 / Page 1<br>Pamantasan ng Cababuy:ao<br>‘ccs plnhana tgp nares toe oes apres<br>[ements RESEARCH[cetINSTRUMENTnee VALIDATIONoo FORM |<br>a Ca<br>[ea CS<br>is suis nb cance iaearoea kd many ee<br>Serres hee reas,<br>Fyn<br>[No]——S—SsCReviewGuestions<br>[1 | cesrandeonywundemandThereseachtainanent is ST7 ST A [ T aT eT 4)T |<br>al<br>Re<br>Paes<br>[T [rcertnrenrmeemnmae 1| T itI7t |||<br>ll<br>(a=eee141IE BH TT<br>Pees| 7 TT<br>Pra<br>| 7 | iT |<br>Thani you tor your participation is vakdating the research nstrument You feedback 8 appreceted<br>hee rsgaler “Lapua<br><!-- End of picture text -->



<!-- Start of picture text -->
PC PRE-FO-80rev 0 0320207) / Page '<br>ee<br>Pamantasaneee ena<br>(Y) casngCabupao<br>RESEARCH INSTRUMENT VALIDATION FORM<br>———————<br>| trgr.Caranac.Nevwro. wir CfbRQ——<br>Sout<br>following5 = StronglyratingAgree scam 4 = Agree 3 = Neutral 2 = Disagree 1 = Songly Oxagree<br>FY ‘The eae nner_ ReviewheaQuestionseof dean Te2 PaheTo Tateee<br>Pema<br>2eee1 11 |<br>a A<br>[7 lala A<br>f eeteaimccieecen | The resmarch instrument provides wcourame ane precee dain  [v|U7" || | |<br>eeead = Pvt<br>Pp<br>“TharA YOu for your participation mn validating thie research instrument Your feedback —sdis apprecated:<br>» Cgealce Fores,<br><!-- End of picture text -->

**COLLEGE OF COMPUTING STUDIES 144** 



<!-- Start of picture text -->
seman<br>© Se sessing<br>Pom my canny cnn n-s roo<br>RESEARCH INSTRUMENT VALIDATION FORM<br>|<br>ea<br>Emmet [Srey Guestowane<br>a<br>igen rhino<br>S= Srongy Agros 4 = Age 3 = Nevira 2 = Olmagwe 1 = Srargly Osage<br>[We] Review Questions dT CP a TP TT)<br>[) _El [eermmersnnmeveny ectainieeiae ses errmmarwemrensttn ens eeTt td|_|<br>(uRBDTaceee acalannncetacaciemaeleen i) 2 Rl<br>(lela<br>[7]oe,The research wnsiuenent proetian acciruie ard precioe| Gate [PYiz | |TP| |<br>ea<br>[BBlanl oleracea fare eo pile HI2S I 2 HaA<br>Trant you tor your pammapalan im vekduirg Poy -waewth retrumert You feedback § aporecaied<br>Cappelcg open.<br><!-- End of picture text -->

**COLLEGE OF COMPUTING STUDIES 145** 

**146** 



<!-- Start of picture text -->
Guiversity of Cabupyao<br>(PAMANTASAN NG CABUYAQO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

- C Info Validated Research Instrument/srmed Consent Form 



<!-- Start of picture text -->
—<br><!-- End of picture text -->



<!-- Start of picture text -->
es<br><!-- End of picture text -->

**COLLEGE OF COMPUTING STUDIES 147** 



<!-- Start of picture text -->
| “4 i]<br>Praeetae Ares,<br><!-- End of picture text -->



<!-- Start of picture text -->
@_ ==_<br>ee<br>os TOTS<br>{ft no 3} Se nie<br>wens Viheladak | ve Wr iee<br><!-- End of picture text -->



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## **148** 



<!-- Start of picture text -->
D Research Ethics Review Committee Evaluation<br><!-- End of picture text -->



<!-- Start of picture text -->
bein<br>ipamusenina<br>Pamantasan(UNIVERSITY OFng CABUYAO)Cabupao<br>Office of the Executive Vice President<br>PnResearch EthicsaReview Office<br>RESEARCH ETHICS CLEARANCE<br>This is fo certity that the research TRANSLATING PSEUDOCODE TO PYTHON: AN<br>ALGORITHMIC APPROACH TO AUTOMATED CODE GENERATION BY MARK ANDREW<br>'$. BAUTISTA, EDUARD JOHN M. MIRANDILLA, MIKAELLA C, DAE, AND MARC GIAN R.<br>erp al ancestor eg nog<br>clearance to proceed with the study.<br>The research study has been evotuated based on the guidelines set by the<br>University's Research Ethics Review Committee and is found to be in compliance<br>informed consent, confidentiality, ond data privacy.<br>| withThis clearancethe ethicalis vatidprinciplesfor theofdurationresearchof theinvolvingstudy ashumanspecifiedsubjects,in theincludingresearch<br>Proposal and subject to periodic review by the Research Ethics Review<br>ame<br>Chak,JANINEUIBOSADA,Research M.Ethics ReviewLPT,CommitteePhD<br>Data ProtectionOtel| coupe Ethics Review Office:<br>Qasgalee Copan.<br><!-- End of picture text -->

**149** 



<!-- Start of picture text -->
Guiversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

E Short Report of Plagiarism Software 

**150** 



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

- F Report of Language Software 



<!-- Start of picture text -->
Pseudo<br>by Prem Shop<br>General metrics<br>14,992 26,354 1,420 Lhr 36 min 3hr6min<br>Writing Issues<br>¥ No issues found<br>Plagiarism<br>Unique Words 13%<br>document<br>48%<br>Rare Words<br><!-- End of picture text -->



<!-- Start of picture text -->
Gniversity of Cabuyao<br>(PAMANTASAN NG CABUYAO)<br><!-- End of picture text -->

# **COLLEGE OF COMPUTING STUDIES** 

## G Bionote 

## of Student Researchers 

**151** 



<!-- Start of picture text -->
Bautista, Mark Andrew S. is an undergraduate student pursuing 2<br>Bachelor(Universityof Scienceof Cabuyag).in ComputerHe has developedScience at Pamantasanfoundationalngknowledge Cabuyag.<br>and skills in software engineering, data structures and algorithms,<br>programming languages, web application development, and system<br>design. His academic interests include progressive web applications,<br>designed to address practical and real-world problemsin programming<br>a ‘search optimization, and the development of educational software<br>He has participated in various academic projects and coursework involving web application<br>development, algorithm implementation, programming, and system analysis and design. His<br>involvement in PseudoPy, an educational pseudocode-to-Python translation system, has<br>provided him with opportunities to further develop his skills in programming, problem-solving,<br>software integration, system development, and technical documentation.<br>For the present study, he serves as a researcher and system developer, contributing to the<br>development, implementation, testing, and refinement of the PseudoPy system, as well as the<br>documentation of its technical processes. His responsibilities include working on a rule-based<br>translation pipeline that incorporates lexical analysis, syntax analysis, semantic checking, and<br>Python code generation. Through this work, he applies his technical knowledge to the<br>development of an educational programming tool intended to support students in translating<br>pseudocode into executable Python code.<br>He is committed to maintaining research integrity, observing appropriate research ethics,<br>protecting the confidentiality of participants, and complying with applicable institutional policies<br>and requirements concerning the collection, processing, and handling of research data.<br>Bautista, Mark Andrew S. affirms that the information provided herein Is accurate and limited to<br>information necessary for academic and research evaluation purposes, in accordance with the<br>Data Privacy Act of 2012.<br><!-- End of picture text -->



<!-- Start of picture text -->
Mikaella Calusin Daet is an undergraduate student currently<br>pursuing @ degree in Bachelor of Science in Computer Science at<br>the University of Cabuyaa She has developed foundational<br>Imowledge in Data Structures, Object-Oriented Programming,<br>Information Management, Statistics and Probability, and Software<br>A Engineering, Sceatalores  with academic interestsfocused onData Analytics and<br>‘She has developed basic programming skills in Java, MySQL. Python, HTML, and CSS,<br>with academic experience in Object-Oriented Programming, Data Structures, and basic<br>game programming. She has participated in academic projects and coursework involving<br>andUl development for a Pet Store System using Figma. a Java-basedCoffee Shop System,<br>‘Sheand has alsoresearchgame creation, activities attended webinars whichrelatedcontributedto and software learningto developmentheractivitiesunderstanding relatedand automated toof Gitsoftware andcode versiondevelopment generation control,<br>practices and technology applications,<br>For the current study, she serves as the Founder and Documentation Lead of the research<br>project entitied “Translating Pseudocode to Python: An Algorithmic Approach to<br>Automated Code Generation.” She is responsible for initiating the research concept,<br>‘organizingof research chapters,and maintainingcoordinatingresearchthedocuments,arrangementassisting inand formattingthe preparationof researchandmat r e rials,vision<br>and supporting the development and documentation of the proposed system. She has<br>also undergone basic orientation or training in research ethics and data privacy,<br>‘supporting compliance with institutional and applicable standards.<br>Mikaela Calusin Daet affirms that the information provided herein is accurate and limited<br>toPrivacywhat IsAct necessary forof 2012.  research evaluation purposes, in compliancewith the Data<br><!-- End of picture text -->

**COLLEGE OF COMPUTING STUDIES 152** 



<!-- Start of picture text -->
Marc Gian R. Reantaso is an undergraduate student<br>pursuing a Bachelor of Science in Computer Science<br>at Pamantasan ng Cabuyao (University of Cabuyao).<br>His academic and professional interests focus on<br>software development, Progressive Web Applications,<br>{PWas), web application development, algorithms,<br>system design, and technology entrepreneurship. He<br>is particularly interested in transforming ideas and<br>identified real-world problems into functional digital<br>products.<br>Throughout his studies, he has developed experience in programming, web<br>development, software engineering, data structures and algorithms, user-centered<br>system development, application optimization, and Progressive Web Application<br>development. His portfolio includes web and PWA projects such as AgriGuard,<br>WasteLink, GIAN, ClassTrack, CaDeT, and PseudoPy, reflecting his continuous<br>exploration of software solutions across different application domains,<br>His development experience also includes designing responsive interfaces,<br>implementing application workflows, integrating data-driven features, improving<br>application performance, and developing systems intended to work across desktop<br>and mobile environments. Beyond software development, he has explored Search<br>Engine Optimization (SEO), online content creation, and entrepreneurship,<br>supporting his broader interest in creating technology that is both technically<br>functional and valuableto its intended users.<br>He Is currently involved in the research and development of PseudoPy, an<br>‘educational pseudocode-to-Python translation system designed to help students<br>understand programming logic and the relationship between pseudocode and<br>‘executable Pythan code. His contributions include web application development,<br>PWA implementation, compiler-related functionality, system refinement,<br>documentation, testing, and technical evaluation. PseudoPy follows a compiler-<br>style processing pipeline involving lexical analysis, recursive-descent parsing,<br>Abstract Syntax Tree construction, semantic analysis, Syntax-Directed Translation,<br><!-- End of picture text -->



<!-- Start of picture text -->
Python code generation, structured feedback, metrics computation, and browser-<br>based execution,<br>In addition to PseudoPy, his project experience Includes AgriGuard, WasteLink,<br>GIAN, ClassTrack, and CaDeT, which contribute to his practical exposure to web-<br>based system development and Progressive Web Application engineering. These<br>projects have strengthened his understanding of turning requirements and<br>concepts into working prototypes and usable software systems.<br>His growing interests include software architecture, educational technology,<br>intelligent systems, product development, PWA engineering, and technology<br>entrepreneurship. He aims to continue strengthening his technical, analytical, and<br>product-development skills while creating software solutions that address practical<br>needs and deliver measurable value.<br>For research documentation purposes, Marc Gian R. Reantaso affirms that the<br>information presented in this bio-note is accurate and limited to information<br>relevant to academic and research evaluation, in accordance with applicable<br>institutional requirements and the Data PrivacyAct of 2012.<br><!-- End of picture text -->

**COLLEGE OF COMPUTING STUDIES 153** 

