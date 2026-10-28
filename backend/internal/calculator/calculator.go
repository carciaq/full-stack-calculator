// Package calculator implements the arithmetic behind the API. It knows nothing
// about HTTP: callers translate its sentinel errors into transport-level responses.
package calculator

import (
	"errors"
	"fmt"
	"math"
	"slices"
)

// Operation names an arithmetic operation, as used in the API path.
type Operation string

const (
	Add        Operation = "add"
	Subtract   Operation = "subtract"
	Multiply   Operation = "multiply"
	Divide     Operation = "divide"
	Power      Operation = "power"
	Percentage Operation = "percentage"
	Sqrt       Operation = "sqrt"
)

// Input errors: the request itself is malformed.
var (
	ErrUnknownOperation = errors.New("unknown operation")
	ErrOperandCount     = errors.New("wrong number of operands")
	ErrInvalidOperand   = errors.New("operand is not a finite number")
)

// Math errors: the request is well formed but has no real, finite answer.
var (
	ErrDivisionByZero     = errors.New("division by zero")
	ErrNegativeSquareRoot = errors.New("square root of a negative number")
	ErrOutOfRange         = errors.New("result out of range")
	ErrUndefined          = errors.New("result is not a real number")
)

type spec struct {
	arity int
	apply func(x []float64) (float64, error)
}

var operations = map[Operation]spec{
	Add:      {2, func(x []float64) (float64, error) { return x[0] + x[1], nil }},
	Subtract: {2, func(x []float64) (float64, error) { return x[0] - x[1], nil }},
	Multiply: {2, func(x []float64) (float64, error) { return x[0] * x[1], nil }},
	Divide: {2, func(x []float64) (float64, error) {
		if x[1] == 0 {
			return 0, ErrDivisionByZero
		}
		return x[0] / x[1], nil
	}},
	Power: {2, func(x []float64) (float64, error) {
		if x[0] == 0 && x[1] < 0 {
			return 0, ErrDivisionByZero
		}
		return math.Pow(x[0], x[1]), nil
	}},
	// Percentage is "a percent of b". Multiplying first keeps 15% of 200 exactly 30.
	Percentage: {2, func(x []float64) (float64, error) { return x[0] * x[1] / 100, nil }},
	Sqrt: {1, func(x []float64) (float64, error) {
		if x[0] < 0 {
			return 0, ErrNegativeSquareRoot
		}
		return math.Sqrt(x[0]), nil
	}},
}

// Calculate applies op to operands. The result is always finite.
func Calculate(op Operation, operands []float64) (float64, error) {
	s, ok := operations[op]
	if !ok {
		return 0, fmt.Errorf("%w: %q", ErrUnknownOperation, op)
	}
	if len(operands) != s.arity {
		return 0, fmt.Errorf("%w: %s takes %d, got %d", ErrOperandCount, op, s.arity, len(operands))
	}
	for _, x := range operands {
		if math.IsNaN(x) || math.IsInf(x, 0) {
			return 0, ErrInvalidOperand
		}
	}

	result, err := s.apply(operands)
	switch {
	case err != nil:
		return 0, err
	case math.IsNaN(result):
		return 0, ErrUndefined
	case math.IsInf(result, 0):
		return 0, ErrOutOfRange
	}
	return result, nil
}

// Arity reports how many operands op takes, and whether op exists.
func Arity(op Operation) (int, bool) {
	s, ok := operations[op]
	return s.arity, ok
}

// Operations lists every supported operation in alphabetical order.
func Operations() []Operation {
	ops := make([]Operation, 0, len(operations))
	for op := range operations {
		ops = append(ops, op)
	}
	slices.Sort(ops)
	return ops
}
