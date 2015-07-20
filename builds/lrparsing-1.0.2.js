/*
 *  JavaScript LR-Parsing Module 1.0.2
 *
 *  Another parser module which allows writing the language in plain JavaScript.
 *  This project was inspired by lrparsing (http://lrparsing.sourceforge.net/), a Python
 *  parser written by Russell Stuart, 2014-05-29.
 *
 *  copyright 2015, Jeroen van der Heijden (Transceptor Technology)
 */

'use strict';

(function () {

    // all functions and constructors are set on lrparsing.
    var lrparsing = {};

    // dummy function which can be used as alternative for onEnter and onExit methods
    lrparsing.noop = function () {};

    var RE_LEFT_WHITESPACE = /^\s+/;
    var RE_DEFAULT_IDENT = /^\w+/;
    var RE_WHITESPACE = /\s+/;

    var isFunction = function (obj) {
        return typeof obj === 'function';
    };

    var buildIdent = function (re) {
        return new RegExp('^' + re);
    };

    var sortOnStrLen = function (a, b) {
        return a.length < b.length;
    };

    var parse = function (element, str, tree, ident) {
        // expecting instance, used for returning feedback when statement is invalid
        var expecting = new Expecting();

        // used to add a node to the tree
        var appendTree = function (tree, node, pos) {
            if (pos > expecting.pos) {
                expecting.empty();
            }
            node.end = pos;
            node.str = str.substring(node.start, node.end);
            tree.push(node);
        };

        // recursive function to 'walk' through the tree
        var walk = function (element, pos, tree, rule, isRequired) {

            var s,
                isValid,
                nodeRes,
                i,
                l,
                reMatch,
                children,
                node,
                mostGreedy;

            s = str.substring(pos).replace(RE_LEFT_WHITESPACE, '');

            node = new Node(element, str.length - s.length);

            expecting.setModeRequired(node.start, isRequired);

            /**************************************************************************
             * Choice
             **************************************************************************/
            if (element instanceof Choice) {
                mostGreedy = new NodeResult(false, node.start);

                for (i = 0, l = element.elements.length; i < l; i++) {
                    children = [];
                    nodeRes = walk(element.elements[i], node.start, children, rule, true);

                    if (nodeRes.isValid && nodeRes.pos > mostGreedy.pos) {
                        node.childs = children;
                        mostGreedy = nodeRes;
                    }
                }
                if (mostGreedy.isValid)
                    appendTree(tree, node, mostGreedy.pos);
                return mostGreedy;
            }

            /**************************************************************************
             * Keyword
             **************************************************************************/
            if (element instanceof Keyword) {
                reMatch = s.match(ident);
                isValid = Boolean( reMatch && reMatch[0] === element.keyword );
                if (isValid)
                    appendTree(tree, node, node.start + element.keyword.length);
                else
                    expecting.update(element, node.start);
                return new NodeResult(isValid, node.end || node.start);
            }

            /**************************************************************************
             * List
             **************************************************************************/
            if (element instanceof List) {
                pos = node.start;
                for (i = 0, l = 0;;) {

                    nodeRes = walk(element.element, pos, node.childs, rule, i < element.min);
                    if (!nodeRes.isValid)
                        break;
                    pos = nodeRes.pos;
                    i++;

                    nodeRes = walk(element.delimiter, pos, node.childs, rule, i < element.min);
                    if (!nodeRes.isValid)
                        break;
                    pos = nodeRes.pos;
                    l++;
                }
                isValid = (!(i < element.min || (element.max && i > element.max) || (!element.opt && i && i == l)));
                if (isValid)
                    appendTree(tree, node, pos);
                return new NodeResult(isValid, pos);
            }

            /**************************************************************************
             * Optional
             **************************************************************************/
            if (element instanceof Optional) {
                nodeRes = walk(element.element, node.start, node.childs, rule, false);
                if (nodeRes.isValid)
                    appendTree(tree, node, nodeRes.pos);
                return new NodeResult(true, node.end || node.start);
            }

            /**************************************************************************
             * Prio
             **************************************************************************/
            if (element instanceof Prio) {
                if (rule._tested[node.start] === undefined) {
                    rule._tested[node.start] = new NodeResult(false, node.start);
                }
                for (i = 0, l = element.elements.length; i < l; i++) {
                    children = [];
                    nodeRes = walk(element.elements[i], node.start, children, rule, true);

                    if (nodeRes.isValid && nodeRes.pos > rule._tested[node.start].pos) {
                        node.childs = children;
                        rule._tested[node.start] = nodeRes;
                    }
                }
                if (rule._tested[node.start].isValid)
                    appendTree(tree, node, rule._tested[node.start].pos);
                return rule._tested[node.start];
            }

            /**************************************************************************
             * Regex
             **************************************************************************/
            if (element instanceof Regex) {
                reMatch = s.match(element._re);
                isValid = Boolean(reMatch);

                if (isValid)
                    appendTree(tree, node, node.start + reMatch[0].length);
                else
                    expecting.update(element, node.start);
                return new NodeResult(isValid, node.end || node.start);
            }

            /**************************************************************************
             * Repeat
             **************************************************************************/
            if (element instanceof Repeat) {
                pos = node.start;
                for (i = 0;!element.max || i < element.max;i++) {
                    nodeRes = walk(element.element, pos, node.childs, rule, i < element.min);
                    if (!nodeRes.isValid)
                        break;
                    pos = nodeRes.pos;
                }
                isValid = (i >= element.min);
                if (isValid)
                    appendTree(tree, node, pos);
                return new NodeResult(isValid, pos);
            }

            /**************************************************************************
             * Rule
             **************************************************************************/
            if (element instanceof Rule) {
                element._tested = {};
                nodeRes = walk(element.element, node.start, node.childs, element, true);
                if (nodeRes.isValid)
                    appendTree(tree, node, nodeRes.pos);
                return nodeRes;
            }

            /**************************************************************************
             * Sequence
             **************************************************************************/
            if (element instanceof Sequence) {

                pos = node.start;
                for (i = 0, l = element.elements.length; i < l; i++) {
                    nodeRes = walk(element.elements[i], pos, node.childs, rule, true);
                    if (nodeRes.isValid)
                        pos = nodeRes.pos;
                    else
                        return nodeRes;
                }
                appendTree(tree, node, nodeRes.pos);
                return nodeRes;
            }

            /**************************************************************************
             * Token
             **************************************************************************/
            if (element instanceof Token) {
                isValid = Boolean(s.indexOf(element.token) === 0);

                if (isValid)
                    appendTree(tree, node, node.start + element.token.length);
                else
                    expecting.update(element, node.start);
                return new NodeResult(isValid, node.end || node.start);
            }

            /**************************************************************************
             * Tokens
             **************************************************************************/
            if (element instanceof Tokens) {
                for (i = 0, l = element.tokens.length; i < l; i++) {
                    if (s.indexOf(element.tokens[i]) === 0) {
                        appendTree(tree, node, node.start + element.tokens[i].length);
                        return new NodeResult(true, node.end);
                    }
                }
                expecting.update(element, node.start);
                return new NodeResult(false, node.start);
            }

            /**************************************************************************
             * This
             **************************************************************************/
            if (element instanceof This) {
                if (rule._tested[node.start] === undefined)
                    rule._tested[node.start] = walk(rule.element, node.start, node.childs, rule, true);
                if (rule._tested[node.start].isValid)
                    appendTree(tree, node, rule._tested[node.start].pos);
                return rule._tested[node.start];
            }

        };

        // start walking the tree
        var nodeRes = walk(element, 0, tree, element, true);

        // get rest if anything
        var rest = str.substring(nodeRes.pos).replace(RE_LEFT_WHITESPACE, '');

        // set isValid to False if we have 'rest' left.
        if (nodeRes.isValid && rest) nodeRes.isValid = false;

        // add EndOfStatement to expecting if this is possible
        if (!nodeRes.isValid && !expecting.required.length) {
            expecting.setModeRequired(nodeRes.pos, true);
            expecting.update(new EndOfStatement(nodeRes.pos), nodeRes.pos);
        }

        // add expecting and correct pos to nodeRes if nodeRes is not valid
        if (!nodeRes.isValid) {
            nodeRes.expecting = expecting.getExpecting();
            nodeRes.pos = expecting.pos;
        }
        // return nodeRes
        return nodeRes;
    };

    /**************************************************************************
     * Choice constructor
     **************************************************************************/
    function Choice () {
        var obj = Lrparsing.call(this, Choice, arguments);
        if (obj) return obj;

        this.elements = this.checkElements(this.args);
    }
    Choice.prototype = Object.create(Lrparsing.prototype);
    Choice.prototype.constructor = Choice;
    lrparsing.Choice = Choice;

    /**************************************************************************
     * Keyword constructor
     **************************************************************************/
    function Keyword (keyword, ignCase) {
        var obj = Lrparsing.call(this, Keyword, arguments);
        if (obj) return obj;

        ignCase = Boolean(ignCase);

        this.keyword = keyword;
        this.ignCase = ignCase;
    }
    Keyword.prototype = Object.create(Lrparsing.prototype);
    Keyword.prototype.constructor = Keyword;
    lrparsing.Keyword = Keyword;

    /**************************************************************************
     * List constructor
     **************************************************************************/
    var List = function List (element, delimiter, _min, _max, opt) {
        var obj = Lrparsing.call(this, List, arguments);
        if (obj) return obj;

        if (!(element instanceof Lrparsing))
            throw '(Lrparsing-->List) first argument must be an instance of Lrparsing; got ' + typeof element;

        if (typeof delimiter !== 'string')
            throw '(Lrparsing-->List) second argument must be a string; got ' + typeof delimiter;

        this.element = element;
        this.delimiter = new Token(delimiter);
        this.min = (_min === undefined || _min === null) ? 0 : _min;
        this.max = (_max === undefined || _max === null) ? null : _max;

        // when true the list may end with a delimiter
        this.opt = Boolean (opt);
    };
    List.prototype = Object.create(Lrparsing.prototype);
    List.prototype.constructor = List;
    lrparsing.List = List;

    /**************************************************************************
     * Optional constructor
     **************************************************************************/
    function Optional (element) {
        var obj = Lrparsing.call(this, Optional, arguments);
        if (obj) return obj;

        if (!(element instanceof Lrparsing))
            throw '(Lrparsing-->Optional) first argument must be an instance of Lrparsing; got ' + typeof element;

        this.element = element;
    }
    Optional.prototype = Object.create(Lrparsing.prototype);
    Optional.prototype.constructor = Optional;
    lrparsing.Optional = Optional;

    /**************************************************************************
     * Prio constructor
     **************************************************************************/
    function Prio () {
        var obj = Lrparsing.call(this, Prio, arguments);
        if (obj) return obj;

        this.elements = this.checkElements(this.args);
        return (new Rule(this));
    }
    Prio.prototype = Object.create(Lrparsing.prototype);
    Prio.prototype.constructor = Prio;
    lrparsing.Prio = Prio;

    /**************************************************************************
     * Regex constructor
     **************************************************************************/
    function Regex (re, ignCase) {
        var obj = Lrparsing.call(this, Regex, arguments);
        if (obj) return obj;

        ignCase = Boolean(ignCase);
        this.re = re;
        this._re = new RegExp('^' + re, ignCase ? 'i' : undefined);
    }
    Regex.prototype = Object.create(Lrparsing.prototype);
    Regex.prototype.constructor = Regex;
    lrparsing.Regex = Regex;

    /**************************************************************************
     * Repeat constructor
     **************************************************************************/
    function Repeat (element, _min, _max) {
        var obj = Lrparsing.call(this, Repeat, arguments);
        if (obj) return obj;

        if (!(element instanceof Lrparsing))
            throw '(Lrparsing-->Repeat) first argument must be an instance of Lrparsing; got ' + typeof element;

        this.element = element;
        this.min = (_min === undefined || _min === null) ? 0 : _min;
        this.max = (_max === undefined || _max === null) ? null : _max;
    }
    Repeat.prototype = Object.create(Lrparsing.prototype);
    Repeat.prototype.constructor = Repeat;
    lrparsing.Repeat = Repeat;

    /**************************************************************************
     * Root constructor
     **************************************************************************/
    function Root (element, ident) {
        var obj = Lrparsing.call(this, Root, arguments);
        if (obj) return obj;

        if (!(element instanceof Lrparsing))
            throw '(Lrparsing-->Optional) first argument must be an instance of Lrparsing; got ' + typeof element;

        this.ident = (ident === undefined) ? RE_DEFAULT_IDENT : buildIdent(ident);
        this.element = element;

        this.parse = function (str) {
            var tree = new Node(this, 0, str.length, str);
            var nodeRes = parse(
                element,
                str,
                tree.childs,
                this.ident
            );

            nodeRes.tree = tree;
            return nodeRes;
        };
    }
    Root.prototype = Object.create(Lrparsing.prototype);
    Root.prototype.constructor = Root;
    lrparsing.Root = Root;

    /**************************************************************************
     * Rule constructor
     **************************************************************************/
    function Rule (element) {
        var obj = Lrparsing.call(this, Rule, arguments);
        if (obj) return obj;

        if (!(element instanceof Lrparsing))
            throw '(Lrparsing-->Rule) first argument must be an instance of Lrparsing; got ' + typeof element;

        this.element = element;
    }
    Rule.prototype = Object.create(Lrparsing.prototype);
    Rule.prototype.constructor = Rule;

    /**************************************************************************
     * Sequence constructor
     **************************************************************************/
    function Sequence () {
        var obj = Lrparsing.call(this, Sequence, arguments);
        if (obj) return obj;

        this.elements = this.checkElements(this.args);
    }
    Sequence.prototype = Object.create(Lrparsing.prototype);
    Sequence.prototype.constructor = Sequence;
    lrparsing.Sequence = Sequence;

    /**************************************************************************
     * This constructor --> THIS
     **************************************************************************/
    var This = function () {
        if (!(this instanceof This))
            return new This();
    };
    This.prototype = Object.create(Lrparsing.prototype);
    This.prototype.constructor = This;
    var THIS = new This();
    lrparsing.THIS = THIS;

    /**************************************************************************
     * Token constructor
     **************************************************************************/
    function Token (token) {
        var obj = Lrparsing.call(this, Token, arguments);
        if (obj) return obj;

        if (typeof token !== 'string')
            throw '(Lrparsing-->Token) first argument must be a string; got ' + typeof token;

        this.token = token;
    }
    Token.prototype = Object.create(Lrparsing.prototype);
    Token.prototype.constructor = Token;
    lrparsing.Token = Token;

    /**************************************************************************
     * Tokens constructor
     **************************************************************************/
    function Tokens (tokens) {
        var obj = Lrparsing.call(this, Tokens, arguments);
        if (obj) return obj;

        if (typeof tokens !== 'string')
            throw '(Lrparsing-->Tokens) first argument must be a string; got ' + typeof tokens;

        this.tokens = tokens.split(RE_WHITESPACE).sort(sortOnStrLen);
    }
    Tokens.prototype = Object.create(Lrparsing.prototype);
    Tokens.prototype.constructor = Tokens;
    lrparsing.Tokens = Tokens;

    /**************************************************************************
     * EndOfStatement constructor
     **************************************************************************/
    function EndOfStatement (pos) {
        this.e = 'End of statement at pos ' + pos;
    }

    /**************************************************************************
     * NodeResult constructor
     **************************************************************************/
    function NodeResult (isValid, pos) {
        this.isValid = isValid;
        this.pos = pos;
        this.expecting = null;
    }

    /**************************************************************************
     * Node constructor
     **************************************************************************/
    function Node (element, start, end, str) {
        this.element = element;
        this.start = start;
        this.end = end;
        this.str = str;
        this.childs = [];
    }
    Node.prototype.walk = function () {
        this.element.onEnter(this);
        for (var i = 0, l = this.childs.length; i < l; i ++) {
            this.childs[i].walk();
        }
        this.element.onExit(this);
    };

    /**************************************************************************
     * Expecting constructor
     **************************************************************************/
    function Expecting () {
        this.required = [];
        this.optional = [];
        this.pos = 0;
        this._modes = [this.required];

    }
    Expecting.prototype.setModeRequired = function (pos, isRequired) {
        if (this._modes[pos] !== this.optional)
            this._modes[pos] = (isRequired === false) ? this.optional : this.required;
    };
    Expecting.prototype.setModeOptional = function (pos, isOptional) {
        this._modes[pos] = (isOptional === false) ? this.required : this.optional;
    };
    Expecting.prototype.empty = function () {
        this.required.length = 0;
        this.optional.length = 0;
    };
    Expecting.prototype.update = function (element, pos) {
        if (pos > this.pos) {
            this.empty();
            this.pos = pos;
        }
        if (pos === this.pos)
            this._modes[pos].push(element);
    };
    Expecting.prototype.getExpecting = function () {
        return this.required.concat(this.optional);
    };

    /***************************************************************************
     * Lrparsing constructor
     *
     * All 'other' objects inherit from Lrparsing
     ***************************************************************************/
    function Lrparsing (Cls, args) {
        args = Array.prototype.slice.call(args);

        if (!(this instanceof Cls))
            return new (Cls.bind.apply(Cls, [Cls].concat(args)))();

        this.setCallbacks(args);
        this.args = args;
    }
    Lrparsing.prototype.setCallbacks = function (args) {
        var idx = args.length - 2,
            first = args[idx],
            second = args[idx + 1];

        if (isFunction(first)) {
            this.onEnter = first;
            this.onExit = second;
            args.splice(idx, 2);
        } else if (isFunction(second)) {
            this.onEnter = second;
            args.splice(idx + 1, 1);
        }
    };
    Lrparsing.prototype.onEnter = lrparsing.noop;
    Lrparsing.prototype.onExit = lrparsing.noop;
    Lrparsing.prototype.checkElements = function (a) {
        var i = 0, l = a.length;
        if (l === 0)
            throw '(Lrparsing-->' + this.constructor.name + ') Need at least one Lrparsing argument';
        for (; i < l; i++)
            if (!(a[i] instanceof Lrparsing)) {
                a[i] = new Token(a[i]);
            }
        return a;
    };

    // export lrparsing
    window.lrparsing = lrparsing;

})();
