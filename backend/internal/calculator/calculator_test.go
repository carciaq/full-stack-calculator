package calculator

import (
	"errors"
	"math"
	"slices"
	"testing"
)

func TestCalculate(t *testing.T) {
	tests := []struct {
		name     string
		op       Operation
		operands []float64
		want     float64
	}{
		{"add", Add, []float64{12, 3}, 15},
		{"add negatives", Add, []float64{-2.5, -0.5}, -3},
		{"subtract", Subtract, []float64{3, 12}, -9},
		{"multiply", Multiply, []float64{-4, 2.5}, -10},
		{"multiply by zero", Multiply, []float64{1e300, 0}, 0},
		{"divide", Divide, []float64{6, 3}, 2},
		{"divide fraction", Divide, []float64{1, 4}, 0.25},
		{"divide zero by number", Divide, []float64{0, 5}, 0},
		{"power", Power, []float64{2, 10}, 1024},
		{"power negative exponent", Power, []float64{2, -2}, 0.25},
		{"power zero to zero", Power, []float64{0, 0}, 1},
		{"power fractional exponent", Power, []float64{9, 0.5}, 3},
		{"percentage", Percentage, []float64{15, 200}, 30},
		{"percentage over 100", Percentage, []float64{150, 40}, 60},
		{"sqrt", Sqrt, []float64{16}, 4},
		{"sqrt zero", Sqrt, []float64{0}, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.operands)
			if err != nil {
				t.Fatalf("Calculate(%s, %v) error = %v", tt.op, tt.operands, err)
			}
			if got != tt.want {
				t.Errorf("Calculate(%s, %v) = %v, want %v", tt.op, tt.operands, got, tt.want)
			}
		})
	}
}

func TestCalculateErrors(t *testing.T) {
	tests := []struct {
		name     string
		op       Operation
		operands []float64
		want     error
	}{
		{"unknown operation", Operation("modulo"), []float64{1, 2}, ErrUnknownOperation},
		{"too few operands", Add, []float64{1}, ErrOperandCount},
		{"too many operands", Sqrt, []float64{4, 9}, ErrOperandCount},
		{"no operands", Multiply, nil, ErrOperandCount},
		{"NaN operand", Add, []float64{math.NaN(), 1}, ErrInvalidOperand},
		{"infinite operand", Add, []float64{1, math.Inf(1)}, ErrInvalidOperand},
		{"divide by zero", Divide, []float64{8, 0}, ErrDivisionByZero},
		{"divide by negative zero", Divide, []float64{8, math.Copysign(0, -1)}, ErrDivisionByZero},
		{"zero to negative power", Power, []float64{0, -1}, ErrDivisionByZero},
		{"negative square root", Sqrt, []float64{-9}, ErrNegativeSquareRoot},
		{"overflowing sum", Add, []float64{math.MaxFloat64, math.MaxFloat64}, ErrOutOfRange},
		{"overflowing product", Multiply, []float64{1e200, 1e200}, ErrOutOfRange},
		{"overflowing power", Power, []float64{10, 400}, ErrOutOfRange},
		{"overflowing percentage", Percentage, []float64{1e300, 1e300}, ErrOutOfRange},
		{"fractional power of negative", Power, []float64{-8, 1.0 / 3}, ErrUndefined},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Calculate(tt.op, tt.operands)
			if !errors.Is(err, tt.want) {
				t.Fatalf("Calculate(%s, %v) = %v, %v; want error %v", tt.op, tt.operands, got, err, tt.want)
			}
		})
	}
}

func TestArity(t *testing.T) {
	if n, ok := Arity(Sqrt); !ok || n != 1 {
		t.Errorf("Arity(sqrt) = %d, %v; want 1, true", n, ok)
	}
	if n, ok := Arity(Divide); !ok || n != 2 {
		t.Errorf("Arity(divide) = %d, %v; want 2, true", n, ok)
	}
	if _, ok := Arity("modulo"); ok {
		t.Error("Arity(modulo) reported ok for an unknown operation")
	}
}

func TestOperations(t *testing.T) {
	want := []Operation{Add, Divide, Multiply, Percentage, Power, Sqrt, Subtract}
	if got := Operations(); !slices.Equal(got, want) {
		t.Errorf("Operations() = %v, want %v", got, want)
	}
}
