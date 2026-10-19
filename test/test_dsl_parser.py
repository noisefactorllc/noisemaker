import pytest
from noisemaker.dsl.tokenizer import tokenize
from noisemaker.dsl.parser import parse

def test_basic_parse():
    ast = parse(tokenize('{ layers: [noise()] }'))
    assert ast['type'] == 'Program'
    assert ast['body']['type'] == 'ObjectExpr'

def test_unknown_key():
    with pytest.raises(Exception) as e:
        parse(tokenize('{ foo: 1 }'))
    assert 'Unknown key' in str(e.value)

def test_duplicate_key():
    with pytest.raises(Exception) as e:
        parse(tokenize('{ layers: [], layers: [] }'))
    assert 'Duplicate key' in str(e.value)


def test_ternary_parse():
    ast = parse(tokenize('coin_flip() ? 1 : 2'))
    assert ast['body']['type'] == 'TernaryExpr'


def test_named_arg_equals():
    ast = parse(tokenize('rotate(angle=45)'))
    call = ast['body']
    assert call['type'] == 'CallExpr'
    assert call['args']['named']['angle']['type'] == 'NumberLiteral'


def test_python_style_conditional_parse():
    ast = parse(tokenize('1 if true else 2'))
    assert ast['body']['type'] == 'TernaryExpr'


def test_null_parse():
    ast = parse(tokenize('null'))
    assert ast['body']['type'] == 'NullLiteral'


def test_c_style_comments():
    source = '''
    // Leading single-line comment
    {
        /* Multi-line
           comment */
        layers: [noise()] // Trailing single-line comment
    }
    '''
    ast = parse(tokenize(source))
    assert ast['body']['type'] == 'ObjectExpr'


def test_unterminated_multiline_comment():
    with pytest.raises(Exception) as e:
        tokenize('/* unterminated comment')
    assert 'Unterminated multi-line comment' in str(e.value)


@pytest.mark.parametrize('text,expected', [('.5', 0.5), ('.025', 0.025), ('.06', 0.06), ('0.5', 0.5), ('5', 5.0), ('1.', 1.0)])
def test_number_with_leading_dot_keeps_dot(text, expected):
    # A number that starts with "." keeps the dot: ".5" is 0.5, not 5
    tokens = tokenize(text)
    assert len(tokens) == 1
    assert tokens[0]['type'] == 'number'
    assert tokens[0]['value'] == expected
    assert tokens[0]['column'] == 1


def test_leading_dot_number_in_expression():
    ast = parse(tokenize('.025 + random() * 0.1'))
    assert ast['body']['type'] == 'BinaryExpr'
    assert ast['body']['left']['value'] == 0.025
