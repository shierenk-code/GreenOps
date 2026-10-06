import math

class Shape:
    def __init__(self, radius):
        self.radius = radius

    def area(self):
        return math.pi * (self.radius ** 2)

def नमस्ते():
    s = Shape(5)
    return s.area()
