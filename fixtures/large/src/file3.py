class PythonProcessor:
    def process_data(self, data):
        return [d * 2 for d in data]

def run_pipeline():
    p = PythonProcessor()
    return p.process_data([1, 2, 3])
