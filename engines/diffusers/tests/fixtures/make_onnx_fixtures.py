"""Builds the tiny ONNX models of tests/test_photo_tools.py (run once; needs the onnx package):
    uv run --with onnx --with numpy python tests/fixtures/make_onnx_fixtures.py
"""
import os

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "onnx")
os.makedirs(HERE, exist_ok=True)
DYN = ["n", 3, "h", "w"]


def save(name, nodes, inputs, outputs, inits=()):
    graph = helper.make_graph(nodes, name, inputs, outputs, list(inits))
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, os.path.join(HERE, name + ".onnx"))


def img(name, shape):
    return helper.make_tensor_value_info(name, TensorProto.FLOAT, shape)


# brighten: 0..1 in, 0..1 out, the picture slightly brighter (x * 0.8 + 0.2), any size
save("brighten", [helper.make_node("Mul", ["image", "a"], ["t"]), helper.make_node("Add", ["t", "b"], ["out"])],
     [img("image", DYN)], [img("out", DYN)],
     [numpy_helper.from_array(np.array(0.8, np.float32), "a"), numpy_helper.from_array(np.array(0.2, np.float32), "b")])

# enlarge 2×: nearest neighbour
save("enlarge2", [helper.make_node("Resize", ["image", "", "scales"], ["out"], mode="nearest")],
     [img("image", DYN)], [img("out", ["n", 3, "h2", "w2"])],
     [numpy_helper.from_array(np.array([1, 1, 2, 2], np.float32), "scales")])

# a mask at a fixed 64 × 64: logits from the red channel (red things are "the subject")
save("mask64", [helper.make_node("Slice", ["image", "s", "e", "ax"], ["r"]),
                helper.make_node("Sub", ["r", "half"], ["c"]), helper.make_node("Mul", ["c", "k"], ["out"])],
     [img("image", [1, 3, 64, 64])], [img("out", [1, 1, 64, 64])],
     [numpy_helper.from_array(np.array([0], np.int64), "s"), numpy_helper.from_array(np.array([1], np.int64), "e"),
      numpy_helper.from_array(np.array([1], np.int64), "ax"), numpy_helper.from_array(np.array(0.0, np.float32), "half"),
      numpy_helper.from_array(np.array(10.0, np.float32), "k")])

# not a photo tool: two inputs
save("two_inputs", [helper.make_node("Add", ["image", "other"], ["out"])],
     [img("image", DYN), img("other", DYN)], [img("out", DYN)])
print("written to", HERE)
