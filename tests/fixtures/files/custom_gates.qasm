OPENQASM 2.0;
include "qelib1.inc";
gate rzx(param0) q0,q1 { h q1; cx q0,q1; rz(param0) q1; cx q0,q1; h q1; }
gate entangle(param0,param1) q0,q1 { ry(param0) q0; rzx(param1/2) q0,q1; }
qreg q[2];
creg c[2];
entangle(pi/2,pi) q[0],q[1];
measure q -> c;
