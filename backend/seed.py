"""Idempotently load the user's design brief, not externally verified knowledge."""
from pathlib import Path
from brain import BrainStore

def seed():
    store=BrainStore(Path(__file__).resolve().parent.parent/'data'/'brain.db')
    existing=store.list_brains()
    brain=next((b for b in existing if b['name']=='Framework design'),None)
    if not brain:
        first=next((b for b in existing if b['name']=='First brain' and b['source_count']==0),None)
        if first:
            with store.db() as db:db.execute('UPDATE brains SET name=? WHERE id=?',('Framework design',first['id']))
            brain=first
        else:brain=store.create_brain('Framework design','Develop a reusable second-brain framework with independent memory, exploration, analysis, and measurable learning.')
    sources=[
        ('Independent brains — user requirement','Not a shared brain for each system. A framework I can apply to each. Like an app I can use for each. If overlap occurs that’s fine. A forking at a certain point to keep the knowledge basis more directed I can do that'),
        ('Coupled loops — user design concept','The design calls for exploration and analytical feedback loops that feed into one another, while observations enter from the environment. The analytical loop should ground proposed connections in evidence. This is a summary of the user’s intended architecture, not a claim that it reproduces biological consciousness.'),
        ('Learning and memory — user brief','The user wants RAG, a knowledge graph, creativity, AutoML, deep learning, and reinforcement learning in a reusable framework. The framework should preserve observations and sources, propose correlations, and explain why those correlations matter. These are requested capabilities; availability must be reported honestly.'),
        ('Evidence policy — implementation decision','A source overlap is a candidate association, not proof. Preserve the original source and distinguish observations, hypotheses, measurements, and accepted ideas. Model evaluation uses a held-out test set. Repeated generated text is not independent evidence. This is an engineering policy proposed for the user’s framework.')
    ]
    for title,body in sources:store.add_source(brain['id'],title,body,'conversation brief — September 2026')
    print('Loaded four design-brief sources into Framework design; repeated runs deduplicate.')

if __name__=='__main__':seed()
